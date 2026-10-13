<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\CategoryKind;
use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

final class DefaultCategoriesSeeder extends Seeder
{
    /**
     * @var array<string, list<array{name: string, icon: string, color: string, children?: list<string>}>>
     */
    private const array TREE = [
        'expense' => [
            ['name' => 'Vivienda', 'icon' => 'house', 'color' => '#5C6BC0', 'children' => ['Alquiler/Hipoteca', 'Electricidad', 'Agua', 'Gas', 'Internet']],
            ['name' => 'Alimentación', 'icon' => 'shopping-cart', 'color' => '#2E7D32', 'children' => ['Supermercado', 'Restaurantes', 'Cafeterías']],
            ['name' => 'Transporte', 'icon' => 'car', 'color' => '#00838F', 'children' => ['Combustible', 'Transporte público', 'Parking', 'Taxi']],
            ['name' => 'Salud', 'icon' => 'heartbeat', 'color' => '#C62828'],
            ['name' => 'Ocio', 'icon' => 'game-controller', 'color' => '#8E24AA'],
            ['name' => 'Compras', 'icon' => 'shopping-bag', 'color' => '#EF6C00'],
            ['name' => 'Suscripciones', 'icon' => 'repeat', 'color' => '#6D4C41'],
            ['name' => 'Educación', 'icon' => 'graduation-cap', 'color' => '#1565C0'],
            ['name' => 'Viajes', 'icon' => 'airplane', 'color' => '#0277BD'],
            ['name' => 'Regalos', 'icon' => 'gift', 'color' => '#AD1457'],
            ['name' => 'Impuestos y tasas', 'icon' => 'bank', 'color' => '#455A64'],
            ['name' => 'Otros', 'icon' => 'dots-three', 'color' => '#757575'],
        ],
        'income' => [
            ['name' => 'Nómina', 'icon' => 'briefcase', 'color' => '#2E7D32'],
            ['name' => 'Freelance', 'icon' => 'laptop', 'color' => '#00897B'],
            ['name' => 'Intereses', 'icon' => 'percent', 'color' => '#1565C0'],
            ['name' => 'Reembolsos', 'icon' => 'arrow-counter-clockwise', 'color' => '#6A1B9A'],
            ['name' => 'Otros ingresos', 'icon' => 'coins', 'color' => '#757575'],
        ],
    ];

    public function run(): void
    {
        DB::transaction(function (): void {
            foreach (self::TREE as $kind => $parents) {
                foreach ($parents as $parentOrder => $definition) {
                    $parent = $this->findOrCreate(CategoryKind::from($kind), null, $definition['name'], $parentOrder, $definition['icon'], $definition['color']);

                    foreach ($definition['children'] ?? [] as $childOrder => $childName) {
                        $this->findOrCreate(CategoryKind::from($kind), $parent->id, $childName, $childOrder);
                    }
                }
            }
        });
    }

    private function findOrCreate(CategoryKind $kind, ?int $parentId, string $name, int $sortOrder, ?string $icon = null, ?string $color = null): Category
    {
        $existing = Category::query()
            ->where('kind', $kind)
            ->where('parent_id', $parentId)
            ->whereRaw('lower(name) = lower(?)', [$name])
            ->first();

        if ($existing !== null) {
            return $existing;
        }

        return Category::query()->create([
            'kind' => $kind,
            'parent_id' => $parentId,
            'name' => $name,
            'sort_order' => $sortOrder,
            'icon' => $icon,
            'color' => $color,
        ]);
    }
}
