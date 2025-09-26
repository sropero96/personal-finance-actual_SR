# Patrones Regex Refinados - Fase 0 Completada

## 📊 Análisis de Resultados

### 🏦 SANTANDER - Patrones Identificados

**Estructura de Transacción Real:**
```
Saldo:7.227,86 EUR( ) a fecha26/08/2025Retenciones :17,99 EUR
```

**Componentes:**
- **Saldo:** `7.227,86 EUR`
- **Fecha:** `26/08/2025` 
- **Descripción:** `Retenciones`
- **Importe:** `17,99 EUR`

**Número de Cuenta:** `ES2400497175032810076563`

### 🏦 REVOLUT - Patrones Identificados

**Estructura de Transacción Real:**
```
4 ago 20255 ago 2025Livraria Lello€1.00€63.37
```

**Componentes:**
- **Fecha:** `4 ago 2025` (fecha de procesamiento) + `5 ago 2025` (fecha de transacción)
- **Descripción:** `Livraria Lello`
- **Importe:** `€1.00`
- **Saldo:** `€63.37`

## 🔧 Patrones Regex Actualizados para Implementación

### SANTANDER_PATTERNS

```typescript
const SANTANDER_PATTERNS = {
  // Identificador del banco
  bankIdentifier: /CUENTA\s+[A-Z]+:|SANTANDER|ES\d{22}/i,
  
  // Número de cuenta español (IBAN)
  accountNumber: /ES\d{22}/g,
  
  // Formato de fecha español
  dateFormat: /\d{2}\/\d{2}\/\d{4}/g,
  
  // Formato de importe español (con puntos de miles y coma decimal)
  amountFormat: /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g,
  
  // Línea completa de transacción Santander
  transactionLine: /Saldo:(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR\([^)]*\)\s*a\s*fecha(\d{2}\/\d{2}\/\d{4})([^€]*):(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g,
  
  // Patrón simplificado para extracción básica
  simpleTransaction: /(\d{2}\/\d{2}\/\d{4})[^:]*:(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g
};
```

### REVOLUT_PATTERNS

```typescript
const REVOLUT_PATTERNS = {
  // Identificador del banco
  bankIdentifier: /Revolut Bank|Revolut/i,
  
  // Formato de fecha español en Revolut (ej: "4 ago 2025")
  dateFormat: /\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+\d{4}/gi,
  
  // Formato de importe con símbolo euro
  amountFormat: /€\d{1,3}(?:\.\d{3})*\.\d{2}/g,
  
  // Línea completa de transacción Revolut
  transactionLine: /(\d{1,2}\s+\w{3}\s+\d{4})\d{1,2}\s+\w{3}\s+\d{4}([^€]+)(€\d+\.\d{2})(€\d+\.\d{2})/g,
  
  // Patrón para extraer fechas separadas (procesamiento y transacción)
  doubleDatePattern: /(\d{1,2}\s+\w{3}\s+\d{4})(\d{1,2}\s+\w{3}\s+\d{4})/g,
  
  // Descripción típica de Revolut
  descriptionPattern: /\d{4}([^€]+)€/g
};
```

## 📝 Mapeo de Meses Español

```typescript
const SPANISH_MONTHS = {
  'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
  'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 
  'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
};
```

## 🔄 Funciones de Conversión Necesarias

### Para Santander:
```typescript
function parseSpanishAmount(amountStr) {
  // "7.227,86 EUR" -> 7227.86
  return parseFloat(amountStr.replace(/\./g, '').replace(',', '.').replace(' EUR', ''));
}

function convertSpanishDate(dateStr) {
  // "26/08/2025" -> "2025-08-26"
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
```

### Para Revolut:
```typescript
function convertRevolutSpanishDate(dateStr) {
  // "4 ago 2025" -> "2025-08-04"
  const [day, monthStr, year] = dateStr.split(' ');
  const month = SPANISH_MONTHS[monthStr.toLowerCase()];
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function parseRevolutAmount(amountStr) {
  // "€126.20" -> 126.20
  return parseFloat(amountStr.replace('€', ''));
}
```

## ✅ Conclusiones de la Fase 0

### 🎯 Patrones Confirmados:

1. **Santander:** Estructura compleja con saldo + fecha + descripción + importe
2. **Revolut:** Estructura con doble fecha + descripción + importe + saldo
3. **Formatos de fecha diferentes:** DD/MM/YYYY vs D MMM YYYY
4. **Formatos de importe diferentes:** Español (1.234,56) vs Internacional (1234.56)

### 🚀 Listo para Fase 1:

Los patrones están definidos y listos para implementar en los parsers MASTRA.

### 📋 Datos de Test Disponibles:

- ✅ 3 PDFs Santander con estructuras consistentes
- ✅ 3 PDFs Revolut con estructuras consistentes  
- ✅ Patrones regex validados con datos reales
- ✅ Funciones de conversión definidas

**Estado:** ✅ FASE 0 COMPLETADA - Listos para implementar en MASTRA
