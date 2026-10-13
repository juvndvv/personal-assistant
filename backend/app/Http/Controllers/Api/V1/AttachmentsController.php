<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Attachments\AddTransactionAttachment;
use App\Actions\Attachments\DeleteAttachment;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreAttachmentRequest;
use App\Http\Resources\Api\V1\AttachmentResource;
use App\Models\Attachment;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;

final class AttachmentsController extends Controller
{
    public function index(Transaction $transaction): AnonymousResourceCollection
    {
        return AttachmentResource::collection(
            $transaction->receipts()->orderBy('created_at')->orderBy('id')->get(),
        );
    }

    public function store(StoreAttachmentRequest $request, Transaction $transaction, AddTransactionAttachment $addAttachment): JsonResponse
    {
        [$kind, $mime] = $request->kindAndMime();

        return (new AttachmentResource($addAttachment->handle($transaction, $request->upload(), $kind, $mime)))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Request $request, Attachment $attachment): BinaryFileResponse
    {
        $disk = Storage::disk($attachment->disk);

        abort_unless($disk->exists($attachment->path), Response::HTTP_NOT_FOUND);

        $name = $attachment->downloadName();

        $response = new BinaryFileResponse($disk->path($attachment->path), Response::HTTP_OK, [
            'Content-Type' => $attachment->mime,
            'X-Content-Type-Options' => 'nosniff',
        ], public: false);

        return $response
            ->setPrivate()
            ->setMaxAge(3600)
            ->setContentDisposition(
                $request->boolean('download') ? ResponseHeaderBag::DISPOSITION_ATTACHMENT : ResponseHeaderBag::DISPOSITION_INLINE,
                $name,
                self::asciiFallback($name),
            );
    }

    private static function asciiFallback(string $name): string
    {
        $fallback = str_replace(['%', '/', '\\'], '', Str::ascii($name));

        return $fallback !== '' ? $fallback : 'receipt';
    }

    public function destroy(Attachment $attachment, DeleteAttachment $deleteAttachment): Response
    {
        $deleteAttachment->handle($attachment);

        return response()->noContent();
    }
}
