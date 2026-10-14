<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Budgets\ClearBudget;
use App\Actions\Budgets\SetBudget;
use App\Domain\Budgets\EffectiveBudget;
use App\Domain\Budgets\EffectiveBudgets;
use App\Domain\Period\PeriodResolver;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ReportPeriodRequest;
use App\Http\Requests\Api\V1\UpdateBudgetRequest;
use App\Http\Resources\Api\V1\BudgetResource;
use App\Models\Budget;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class BudgetsController extends Controller
{
    public function index(ReportPeriodRequest $request, PeriodResolver $periods, EffectiveBudgets $budgets): AnonymousResourceCollection
    {
        return BudgetResource::collection(array_map(
            fn (EffectiveBudget $budget): BudgetResource => new BudgetResource($budget),
            $budgets->forPeriod($request->period($periods)),
        ));
    }

    public function update(UpdateBudgetRequest $request, Category $category, SetBudget $setBudget): BudgetResource
    {
        return new BudgetResource($setBudget->handle($category->id, $request->amountCents(), $request->effectiveFrom()));
    }

    public function destroy(Category $category, ClearBudget $clearBudget): Response
    {
        $clearBudget->handle($category);

        return response()->noContent();
    }

    public function history(Category $category): JsonResponse
    {
        $rows = Budget::query()
            ->where('category_id', $category->id)
            ->orderByDesc('effective_from')
            ->get()
            ->map(fn (Budget $budget): array => [
                'effective_from' => $budget->effective_from,
                'amount_cents' => $budget->amount_cents,
            ]);

        return new JsonResponse(['data' => $rows->values()->all()]);
    }
}
