# PRD – App personal de finanzas

Oct 13, 2026 · @Juan Daniel Forner Garriga

## Resumen y problema

PWA self-hosted, de un solo usuario, para registrar gastos, ingresos y traspasos entre cuentas, y obtener un informe mensual fiable.

**Problema.** Las apps de gastos existentes acaban abandonadas porque registrar cada movimiento cuesta demasiado. Con registros incompletos, los informes no sirven.

**Propuesta de valor.** Registrar un movimiento en menos de 10 segundos por voz o foto, y que los gastos fijos se apunten solos. La reducción de fricción es el diferenciador; el resto de funcionalidades son estándar.

## Objetivos, no-objetivos y métricas

El éxito se mide por si los registros están completos, no por el número de funcionalidades.

| Métrica | Objetivo | Cómo se mide |
| --- | --- | --- |
| Cobertura de gastos registrados | ≥ 90 % del mes | Comparación manual con el extracto bancario, una vez al mes |
| Tiempo de registro por voz/foto | < 10 s incluida la confirmación | Tiempo entre abrir la captura y confirmar |
| Borradores aceptados sin corregir | ≥ 80 % | Campos editados antes de confirmar |
| Constancia de uso | Registro ≥ 5 de cada 7 días | Días con al menos un movimiento |

**No-objetivos (fuera de alcance):**

- Conexión con bancos (PSD2) e importación de extractos.
- Detección de desviaciones o cargos ausentes en gastos fijos.
- Multiusuario, gastos compartidos y multidivisa (solo EUR).
- Gestión de inversiones: posiciones, valoración o rentabilidad.
- Funcionamiento sin conexión.

## Usuario y contexto de uso

Un único usuario: el propietario, residente en España, con todas sus finanzas en euros.

- **Captura (móvil):** en el momento del gasto, con una mano y en pocos segundos. Es el flujo crítico.
- **Revisión (móvil o escritorio):** corregir movimientos, actualizar saldos de inversión y efectivo.
- **Análisis (escritorio, mensual):** consultar el informe del mes y ajustar presupuestos.

## Modelo de dominio

Todo es un movimiento sobre una cuenta; solo gastos e ingresos cuentan en los informes, nunca traspasos ni ajustes de saldo.

| Entidad | Definición | Reglas clave |
| --- | --- | --- |
| Cuenta | Corriente, efectivo, tarjeta de crédito o ahorro/inversión | Saldo inicial + fecha de inicio; saldo actual calculado |
| Movimiento | Gasto, ingreso, traspaso o ajuste de saldo | Importe, fecha, cuenta, categoría, nota, origen (manual, voz, foto, fijo) y estado (borrador, confirmado) |
| Traspaso | Movimiento entre dos cuentas propias | Excluido de gastos e ingresos; no altera el patrimonio neto |
| Tarjeta de crédito diferida | Cuenta de deuda (saldo negativo) | Compra = gasto en la tarjeta, en su fecha de compra. Liquidación = traspaso banco → tarjeta. Así el gasto no se cuenta dos veces |
| Ajuste de saldo | Corrección manual del saldo con fecha | Uso típico: inversión y efectivo. Excluido de gastos e ingresos; sí afecta al patrimonio |
| Gasto/ingreso fijo | Plantilla: importe, categoría, cuenta, periodicidad, día | Genera un movimiento confirmado automáticamente en su fecha |
| Categoría | Categoría con subcategorías opcionales | Separadas para gastos e ingresos |
| Presupuesto | Importe mensual por categoría de gasto | Se repite cada mes salvo cambio |

Importes almacenados como enteros en céntimos para evitar errores de redondeo.

## Requisitos funcionales

P0 = MVP, P1 = justo después, P2 = posterior. El núcleo es P0 aunque no esté en el ranking: voz y foto no funcionan sin él.

| ID | Módulo | Requisito | Prioridad |
| --- | --- | --- | --- |
| RF-01 | Núcleo | Crear, editar y archivar cuentas de los 4 tipos | P0 |
| RF-02 | Núcleo | Registro manual de gasto o ingreso en ≤ 3 toques, con valores por defecto (hoy, última cuenta usada) | P0 |
| RF-03 | Núcleo | Traspasos entre cuentas | P0 |
| RF-04 | Núcleo | Liquidación de tarjeta como traspaso, con importe sugerido del periodo | P0 |
| RF-05 | Núcleo | Ajuste manual de saldo con fecha | P0 |
| RF-06 | Núcleo | Categorías y subcategorías editables | P0 |
| RF-07 | Núcleo | Listado de movimientos con búsqueda, filtros y edición | P0 |
| RF-10 | Captura | Voz: grabar audio → transcribir → extraer importe, concepto, categoría, cuenta y fecha → borrador editable | P0 |
| RF-11 | Captura | Foto de ticket → extraer los mismos campos → borrador editable | P0 |
| RF-12 | Captura | Nada se guarda sin confirmación; campos de baja confianza resaltados | P0 |
| RF-13 | Captura | Sugerir categoría y cuenta según correcciones previas del mismo concepto o comercio | P1 |
| RF-20 | Fijos | Plantillas de gasto/ingreso fijo con periodicidad (mensual, trimestral, anual) | P0 |
| RF-21 | Fijos | Generación automática en su fecha, marcada con origen "fijo" | P0 |
| RF-22 | Fijos | Previsión de fijos pendientes del mes en curso | P1 |
| RF-30 | Informes | Gasto por categoría del mes y evolución de los últimos 12 meses | P1 |
| RF-31 | Informes | Tasa de ahorro = (ingresos − gastos) / ingresos | P1 |
| RF-32 | Informes | Patrimonio neto = suma de saldos (tarjetas restan), con fecha de última actualización por cuenta | P1 |
| RF-33 | Informes | Presupuesto vs real por categoría | P2 |
| RF-40 | Presupuestos | Importe mensual por categoría | P2 |
| RF-50 | Datos | Exportación completa a CSV | P1 |

## Requisitos no funcionales

La decisión técnica más importante es dónde se procesan voz y foto: condiciona coste, privacidad y hardware.

- **Plataforma:** PWA instalable en iOS, Android y escritorio. Requiere conexión.
- **Despliegue:** self-hosted con Docker Compose en VPS o NAS. HTTPS obligatorio: cámara y micrófono solo funcionan en contexto seguro.
- **Seguridad:** un usuario con contraseña y sesión persistente. Recomendado no exponer el servidor directamente: acceso por VPN (p. ej. Tailscale) o proxy inverso con autenticación.
- **Voz:** grabar audio en el navegador y transcribir en servidor. No depender de la API de reconocimiento de voz del navegador, poco fiable en Safari/iOS.
- **Procesamiento IA (proveedor configurable):**
  - Opción A, API externa: mejor calidad, coste por uso, los datos salen de tu servidor.
  - Opción B, modelos locales: privacidad total, pero exige GPU o CPU potente; un NAS doméstico típico no basta.
- **Rendimiento:** extracción de voz o foto < 5 s; guardado tras confirmar < 1 s.
- **Datos:** copias de seguridad automáticas diarias de la base de datos. Zona horaria Europe/Madrid.

## Roadmap

Cuatro fases secuenciales; el MVP son las dos primeras. Ajusto tu orden de prioridades en un punto: el núcleo va antes que la captura por voz y foto, porque esta solo genera movimientos sobre cuentas y categorías que ya deben existir.

&#91;embedded content: Roadmap · 4 fases, 3 gates\]

No se pasa de fase sin cumplir su gate. Los gates son una propuesta: ajústalos a tu ritmo.

## Riesgos, decisiones y preguntas abiertas

El mayor riesgo es que la captura por voz o foto no sea más rápida que la manual: entonces el proyecto pierde su razón de ser.

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Captura IA lenta o con muchos errores | Se abandona la app, como las anteriores | Medir tiempo y tasa de corrección desde el primer día (ver métricas) |
| Fijos con importe variable (luz, gas) registrados con el importe de plantilla | Informes ligeramente inexactos sin aviso | Opción de marcar un fijo como "variable" para que pida el importe real |
| Datos financieros enviados a una API externa | Privacidad | Proveedor configurable; enviar solo audio/imagen, sin histórico |
| Servidor self-hosted expuesto a internet | Acceso no autorizado a datos financieros | VPN o proxy con autenticación; backups cifrados |
| Saldos de inversión desactualizados | Patrimonio neto engañoso | Mostrar fecha de última actualización por cuenta |

**Decisiones tomadas:**

- Un usuario, solo EUR, sin modo offline.
- Entrada manual, por voz y por foto; sin importación bancaria.
- Fijos automáticos sin detección de desviaciones.
- Inversión: solo saldo, actualizado a mano.
- Presupuesto mensual por categoría.

**Preguntas abiertas:**

- [ ] ¿API externa o modelos locales para voz y foto? ¿Qué hardware tienes?
- [ ] ¿El mes del informe es natural o va de nómina a nómina?
- [ ] ¿Necesitas etiquetas además de categorías (p. ej. "viaje Roma")?
- [ ] ¿Activamos la opción de fijo variable?
- [ ] ¿Desde qué fecha arrancas y con qué saldos iniciales?
