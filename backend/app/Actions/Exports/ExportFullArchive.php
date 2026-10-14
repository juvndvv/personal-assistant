<?php

declare(strict_types=1);

namespace App\Actions\Exports;

use App\Domain\Exports\CsvWriter;
use App\Domain\Ledger\BalanceCalculator;
use App\Enums\CsvDelimiter;
use App\Models\Account;
use App\Models\Attachment;
use App\Models\Budget;
use App\Models\Category;
use App\Models\RecurringTemplate;
use App\Models\Setting;
use App\Models\Tag;
use App\Models\Transfer;
use Closure;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;
use ZipArchive;

final readonly class ExportFullArchive
{
    public const string RECEIPTS_DIRECTORY = 'receipts';

    public const array FILES = [
        'accounts.csv', 'categories.csv', 'transactions.csv', 'transfers.csv', 'tags.csv',
        'recurring_templates.csv', 'budgets.csv', 'attachments.csv', 'settings.csv',
    ];

    private const int CHUNK_SIZE = 500;

    public function __construct(
        private ExportTransactionsCsv $exportTransactions,
        private BalanceCalculator $balances,
        private ?string $temporaryDirectory = null,
    ) {}

    public function handle(bool $includeReceipts = false, CsvDelimiter $delimiter = CsvDelimiter::Semicolon): string
    {
        $archivePath = $this->temporaryFile('zip');
        $parts = [];
        $zip = new ZipArchive;

        try {
            if ($zip->open($archivePath, ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('The export archive could not be created.');
            }

            $writers = [
                'accounts.csv' => $this->accounts(...),
                'categories.csv' => self::categories(...),
                'transactions.csv' => fn ($output, CsvDelimiter $delimiter) => $this->exportTransactions->handleIncludingDeleted($delimiter, $output),
                'transfers.csv' => self::transfers(...),
                'tags.csv' => self::tags(...),
                'recurring_templates.csv' => self::recurringTemplates(...),
                'budgets.csv' => self::budgets(...),
                'attachments.csv' => fn ($output, CsvDelimiter $delimiter) => self::attachments($output, $delimiter, $includeReceipts),
                'settings.csv' => self::settings(...),
            ];

            foreach ($writers as $name => $write) {
                $parts[] = $part = $this->temporaryFile('csv');
                self::writePart($part, $write, $delimiter);
                $zip->addFile($part, $name);
            }

            if ($includeReceipts) {
                self::addReceipts($zip);
            }

            if (! $zip->close()) {
                throw new RuntimeException('The export archive could not be written.');
            }
        } catch (Throwable $exception) {
            @unlink($archivePath);

            throw $exception;
        } finally {
            foreach ($parts as $part) {
                @unlink($part);
            }
        }

        return $archivePath;
    }

    public static function receiptName(Attachment $attachment): string
    {
        $extension = pathinfo($attachment->path, PATHINFO_EXTENSION);

        return self::RECEIPTS_DIRECTORY.'/'.$attachment->id.($extension === '' ? '' : '.'.$extension);
    }

    /**
     * @param  Closure(resource, CsvDelimiter): void  $write
     */
    private static function writePart(string $path, Closure $write, CsvDelimiter $delimiter): void
    {
        $output = fopen($path, 'wb');

        if ($output === false) {
            throw new RuntimeException('The export could not open a temporary file.');
        }

        try {
            $write($output, $delimiter);
        } finally {
            fclose($output);
        }
    }

    private function temporaryFile(string $extension): string
    {
        $path = tempnam($this->temporaryDirectory ?? sys_get_temp_dir(), 'finance-export-');

        if ($path === false) {
            throw new RuntimeException("The export could not create a temporary {$extension} file.");
        }

        return $path;
    }

    /**
     * @param  resource  $output
     */
    private function accounts($output, CsvDelimiter $delimiter): void
    {
        $writer = CsvWriter::start($output, $delimiter, [
            'id', 'name', 'type', 'opening_balance_cents', 'opening_date', 'statement_day', 'settlement_account_id',
            'sort_order', 'balance_cents', 'balance_eur', 'archived_at', 'created_at', 'deleted_at',
        ]);
        $balances = $this->balances->forAccounts();

        foreach (Account::withTrashed()->lazyById(self::CHUNK_SIZE) as $account) {
            $balance = $account->deleted_at === null ? ($balances[$account->id] ?? $account->opening_balance_cents) : null;

            $writer->row([
                $account->id,
                $account->name,
                $account->type->value,
                $account->opening_balance_cents,
                $account->opening_date->toDateString(),
                $account->statement_day,
                $account->settlement_account_id,
                $account->sort_order,
                $balance,
                $writer->euros($balance),
                $account->archived_at,
                $account->created_at,
                $account->deleted_at,
            ]);
        }
    }

    /**
     * @param  resource  $output
     */
    private static function categories($output, CsvDelimiter $delimiter): void
    {
        $writer = CsvWriter::start($output, $delimiter, [
            'id', 'kind', 'name', 'parent_id', 'parent_name', 'icon', 'color', 'sort_order', 'archived_at', 'created_at',
        ]);

        foreach (Category::query()->with('parent')->lazyById(self::CHUNK_SIZE) as $category) {
            $writer->row([
                $category->id,
                $category->kind->value,
                $category->name,
                $category->parent_id,
                $category->parent?->name,
                $category->icon,
                $category->color,
                $category->sort_order,
                $category->archived_at,
                $category->created_at,
            ]);
        }
    }

    /**
     * @param  resource  $output
     */
    private static function transfers($output, CsvDelimiter $delimiter): void
    {
        $writer = CsvWriter::start($output, $delimiter, [
            'id', 'kind', 'date', 'from_account_id', 'from_account', 'to_account_id', 'to_account', 'amount_cents',
            'amount_eur', 'note', 'created_at', 'deleted_at',
        ]);

        foreach (Transfer::withTrashed()->with(['fromAccount', 'toAccount'])->lazyById(self::CHUNK_SIZE) as $transfer) {
            $writer->row([
                $transfer->id,
                $transfer->kind->value,
                $transfer->date->toDateString(),
                $transfer->from_account_id,
                $transfer->fromAccount->name,
                $transfer->to_account_id,
                $transfer->toAccount->name,
                $transfer->amount_cents,
                $writer->euros($transfer->amount_cents),
                $transfer->note,
                $transfer->created_at,
                $transfer->deleted_at,
            ]);
        }
    }

    /**
     * @param  resource  $output
     */
    private static function tags($output, CsvDelimiter $delimiter): void
    {
        $writer = CsvWriter::start($output, $delimiter, ['id', 'name', 'transactions_count', 'created_at']);

        foreach (Tag::query()->withCount('transactions')->lazyById(self::CHUNK_SIZE) as $tag) {
            $count = $tag->getAttribute('transactions_count');

            $writer->row([$tag->id, $tag->name, is_numeric($count) ? (int) $count : 0, $tag->created_at]);
        }
    }

    /**
     * @param  resource  $output
     */
    private static function recurringTemplates($output, CsvDelimiter $delimiter): void
    {
        $writer = CsvWriter::start($output, $delimiter, [
            'id', 'name', 'type', 'amount_cents', 'amount_eur', 'is_variable', 'account_id', 'account', 'category_id',
            'category', 'frequency', 'day_of_month', 'starts_on', 'ends_on', 'description', 'merchant', 'note',
            'paused_at', 'created_at', 'deleted_at',
        ]);

        $templates = RecurringTemplate::withTrashed()->with(['account', 'category'])->lazyById(self::CHUNK_SIZE);

        foreach ($templates as $template) {
            $writer->row([
                $template->id,
                $template->name,
                $template->type->value,
                $template->amount_cents,
                $writer->euros($template->amount_cents),
                $template->is_variable,
                $template->account_id,
                $template->account->name,
                $template->category_id,
                $template->category->name,
                $template->frequency->value,
                $template->day_of_month,
                $template->starts_on->toDateString(),
                $template->ends_on?->toDateString(),
                $template->description,
                $template->merchant,
                $template->note,
                $template->paused_at,
                $template->created_at,
                $template->deleted_at,
            ]);
        }
    }

    /**
     * @param  resource  $output
     */
    private static function budgets($output, CsvDelimiter $delimiter): void
    {
        $writer = CsvWriter::start($output, $delimiter, [
            'id', 'category_id', 'category', 'effective_from', 'amount_cents', 'amount_eur', 'created_at',
        ]);

        foreach (Budget::query()->with('category')->lazyById(self::CHUNK_SIZE) as $budget) {
            $writer->row([
                $budget->id,
                $budget->category_id,
                $budget->category->name,
                $budget->effective_from,
                $budget->amount_cents,
                $writer->euros($budget->amount_cents),
                $budget->created_at,
            ]);
        }
    }

    /**
     * @param  resource  $output
     */
    private static function attachments($output, CsvDelimiter $delimiter, bool $includeReceipts): void
    {
        $writer = CsvWriter::start($output, $delimiter, [
            'id', 'transaction_id', 'kind', 'mime', 'size', 'sha256', 'original_name', 'file', 'created_at',
        ]);

        foreach (self::receipts() as $attachment) {
            $writer->row([
                $attachment->id,
                $attachment->transaction_id,
                $attachment->kind->value,
                $attachment->mime,
                $attachment->size_bytes,
                $attachment->sha256,
                $attachment->original_name,
                $includeReceipts && self::storedReceiptPath($attachment) !== null ? self::receiptName($attachment) : null,
                $attachment->created_at,
            ]);
        }
    }

    /**
     * @param  resource  $output
     */
    private static function settings($output, CsvDelimiter $delimiter): void
    {
        $writer = CsvWriter::start($output, $delimiter, [
            'month_start_day', 'default_account_id', 'last_used_account_id', 'orphan_draft_ttl_days', 'updated_at',
        ]);
        $settings = Setting::current();

        $writer->row([
            $settings->month_start_day,
            $settings->default_account_id,
            $settings->last_used_account_id,
            $settings->orphan_draft_ttl_days,
            $settings->updated_at,
        ]);
    }

    private static function addReceipts(ZipArchive $zip): void
    {
        foreach (self::receipts() as $attachment) {
            $storedPath = self::storedReceiptPath($attachment);

            if ($storedPath !== null) {
                $zip->addFile($storedPath, self::receiptName($attachment));
            }
        }
    }

    private static function storedReceiptPath(Attachment $attachment): ?string
    {
        $disk = Storage::disk($attachment->disk);

        return $disk->exists($attachment->path) ? $disk->path($attachment->path) : null;
    }

    /**
     * @return iterable<int, Attachment>
     */
    private static function receipts(): iterable
    {
        return Attachment::query()
            ->whereNotNull('transaction_id')
            ->orderBy('created_at')
            ->orderBy('id')
            ->lazy(self::CHUNK_SIZE);
    }
}
