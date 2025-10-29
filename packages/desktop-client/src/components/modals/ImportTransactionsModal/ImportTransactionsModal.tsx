// @ts-strict-ignore
import React, {
  useState,
  useEffect,
  useCallback,
  type ComponentProps,
} from 'react';
import { useTranslation, Trans } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { Stack } from '@actual-app/components/stack';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import deepEqual from 'deep-equal';

import { send } from 'loot-core/platform/client/fetch';
import { type ParseFileOptions } from 'loot-core/server/transactions/import/parse-file';
import { amountToInteger } from 'loot-core/shared/util';

import { CheckboxOption } from './CheckboxOption';
import { DateFormatSelect } from './DateFormatSelect';
import { FieldMappings } from './FieldMappings';
import { InOutOption } from './InOutOption';
import { MultiplierOption } from './MultiplierOption';
import { Transaction } from './Transaction';
import {
  applyFieldMappings,
  dateFormats,
  isDateFormat,
  parseAmountFields,
  parseDate,
  stripCsvImportTransaction,
  type DateFormat,
  type FieldMapping,
  type ImportTransaction,
} from './utils';

import {
  importPreviewTransactions,
  importTransactions,
} from '@desktop-client/accounts/accountsSlice';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { SectionLabel } from '@desktop-client/components/forms';
import { AICategorizeModal } from '@desktop-client/components/modals/AICategorizeModal';
import {
  TableHeader,
  TableWithNavigator,
} from '@desktop-client/components/table';
import { fetchAgent2Context } from '@desktop-client/hooks/useAgent2Context';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useDateFormat } from '@desktop-client/hooks/useDateFormat';
import { useSyncedPrefs } from '@desktop-client/hooks/useSyncedPrefs';
import { addNotification } from '@desktop-client/notifications/notificationsSlice';
import { reloadPayees } from '@desktop-client/payees/payeesSlice';
import { useDispatch, useSelector } from '@desktop-client/redux';
import {
  suggestCategoriesWithRetry,
  checkAgentServerHealth,
  type Agent2Suggestion,
} from '@desktop-client/util/agent2-service';

function getFileType(filepath: string): string {
  const m = filepath.match(/\.([^.]*)$/);
  if (!m) return 'ofx';
  const rawType = m[1].toLowerCase();
  if (rawType === 'tsv') return 'csv';
  return rawType;
}

function getInitialDateFormat(transactions, mappings) {
  if (transactions.length === 0 || mappings.date == null) {
    return 'yyyy mm dd';
  }

  const transaction = transactions[0];
  const date = transaction[mappings.date];

  const found =
    date == null
      ? null
      : dateFormats.find(f => parseDate(date, f.format) != null);
  return found ? found.format : 'mm dd yyyy';
}

function getInitialMappings(transactions) {
  if (transactions.length === 0) {
    return {};
  }

  const transaction = stripCsvImportTransaction(transactions[0]);
  const fields = Object.entries(transaction);

  function key(entry) {
    return entry ? entry[0] : null;
  }

  const dateField = key(
    fields.find(([name]) => name.toLowerCase().includes('date')) ||
      fields.find(([, value]) => String(value)?.match(/^\d+[-/]\d+[-/]\d+$/)),
  );

  const amountField = key(
    fields.find(([name]) => name.toLowerCase().includes('amount')) ||
      fields.find(([, value]) => String(value)?.match(/^-?[.,\d]+$/)),
  );

  const categoryField = key(
    fields.find(([name]) => name.toLowerCase().includes('category')),
  );

  const payeeField = key(
    fields.find(([name]) => name.toLowerCase().includes('payee')) ||
      fields.find(
        ([name]) =>
          name !== dateField && name !== amountField && name !== categoryField,
      ),
  );

  const notesField = key(
    fields.find(([name]) => name.toLowerCase().includes('notes')) ||
      fields.find(
        ([name]) =>
          name !== dateField &&
          name !== amountField &&
          name !== categoryField &&
          name !== payeeField,
      ),
  );

  const inOutField = key(
    fields.find(
      ([name]) =>
        name !== dateField &&
        name !== amountField &&
        name !== payeeField &&
        name !== notesField,
    ),
  );

  return {
    date: dateField,
    amount: amountField,
    payee: payeeField,
    notes: notesField,
    inOut: inOutField,
    category: categoryField,
  };
}

function parseCategoryFields(trans, categories) {
  let match = null;
  categories.forEach(category => {
    if (category.id === trans.category) {
      return null;
    }
    if (category.name === trans.category) {
      match = category.id;
    }
  });
  return match;
}

export function ImportTransactionsModal({
  filename: originalFileName,
  accountId,
  onImported,
}) {
  const { t } = useTranslation();
  const dateFormat = useDateFormat() || ('MM/dd/yyyy' as const);
  const [prefs, savePrefs] = useSyncedPrefs();
  const dispatch = useDispatch();
  const categories = useCategories();

  const [multiplierAmount, setMultiplierAmount] = useState('');
  const [loadingState, setLoadingState] = useState<
    null | 'parsing' | 'importing'
  >('parsing');
  const [error, setError] = useState<{
    parsed: boolean;
    message: string;
  } | null>(null);
  const [filename, setFilename] = useState(originalFileName);
  const [transactions, setTransactions] = useState<ImportTransaction[]>([]);
  const [filetype, setFileType] = useState('unknown');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [flipAmount, setFlipAmount] = useState(false);
  const [multiplierEnabled, setMultiplierEnabled] = useState(false);
  const [reconcile, setReconcile] = useState(true);
  const [importNotes, setImportNotes] = useState(true);

  // Agent 2 (Category Suggester) state
  const [showAICategorizeModal, setShowAICategorizeModal] = useState(false);
  const [agent2Suggestions, setAgent2Suggestions] = useState<
    Agent2Suggestion[]
  >([]);
  const [isLoadingAgent2, setIsLoadingAgent2] = useState(false);

  // This cannot be set after parsing the file, because changing it
  // requires re-parsing the file. This is different from the other
  // options which are simple post-processing. That means if you
  // parsed different files without closing the modal, it wouldn't
  // re-read this.
  const [delimiter, setDelimiter] = useState(
    prefs[`csv-delimiter-${accountId}`] ||
      (filename.endsWith('.tsv') ? '\t' : ','),
  );
  const [skipLines, setSkipLines] = useState(
    parseInt(prefs[`csv-skip-lines-${accountId}`], 10) || 0,
  );
  const [inOutMode, setInOutMode] = useState(
    String(prefs[`csv-in-out-mode-${accountId}`]) === 'true',
  );
  const [outValue, setOutValue] = useState(
    prefs[`csv-out-value-${accountId}`] ?? '',
  );
  const [hasHeaderRow, setHasHeaderRow] = useState(
    String(prefs[`csv-has-header-${accountId}`]) !== 'false',
  );
  const [fallbackMissingPayeeToMemo, setFallbackMissingPayeeToMemo] = useState(
    String(prefs[`ofx-fallback-missing-payee-${accountId}`]) !== 'false',
  );

  const [parseDateFormat, setParseDateFormat] = useState<DateFormat | null>(
    null,
  );

  const [clearOnImport, setClearOnImport] = useState(true);

  const getImportPreview = useCallback(
    async (
      transactions,
      filetype,
      flipAmount,
      fieldMappings,
      splitMode,
      parseDateFormat: DateFormat,
      inOutMode,
      outValue,
      multiplierAmount,
    ) => {
      const previewTransactions = [];
      const inOutModeEnabled = isOfxFile(filetype) ? false : inOutMode;

      for (let trans of transactions) {
        if (trans.isMatchedTransaction) {
          // skip transactions that are matched transaction (existing transaction added to show update changes)
          continue;
        }

        trans = fieldMappings
          ? applyFieldMappings(trans, fieldMappings)
          : trans;

        const date =
          isOfxFile(filetype) || isCamtFile(filetype) || isPdfFile(filetype)
            ? trans.date
            : parseDate(trans.date, parseDateFormat);
        if (date == null) {
          console.log(
            `Unable to parse date ${
              trans.date || '(empty)'
            } with given date format`,
          );
          continue; // Skip this transaction and continue with the rest
        }
        if (trans.payee_name == null || typeof trans.payee_name !== 'string') {
          console.log(`Unable·to·parse·payee·${trans.payee_name || '(empty)'}`);
          continue; // Skip this transaction and continue with the rest
        }

        const { amount } = parseAmountFields(
          trans,
          splitMode,
          inOutModeEnabled,
          outValue,
          flipAmount,
          multiplierAmount,
        );
        if (amount == null) {
          console.log(`Transaction on ${trans.date} has no amount`);
          continue; // Skip this transaction and continue with the rest
        }

        const category_id = parseCategoryFields(trans, categories.list);
        if (category_id != null) {
          trans.category = category_id;
        }

        const {
          inflow,
          outflow,
          inOut,
          existing,
          ignored,
          selected,
          selected_merge,
          ...finalTransaction
        } = trans;
        previewTransactions.push({
          ...finalTransaction,
          date,
          amount: amountToInteger(amount),
          cleared: clearOnImport,
        });
      }

      // Retreive the transactions that would be updated (along with the existing trx)
      const previewTrx = await dispatch(
        importPreviewTransactions({
          accountId,
          transactions: previewTransactions,
        }),
      ).unwrap();
      const matchedUpdateMap = previewTrx.reduce((map, entry) => {
        // @ts-expect-error - entry.transaction might not have trx_id property
        map[entry.transaction.trx_id] = entry;
        return map;
      }, {});

      const result = transactions
        .filter(trans => !trans.isMatchedTransaction)
        .reduce((previous, current_trx) => {
          let next = previous;
          const entry = matchedUpdateMap[current_trx.trx_id];
          const existing_trx = entry?.existing;

          // if the transaction is matched with an existing one for update
          current_trx.existing = !!existing_trx;
          // if the transaction is an update that will be ignored
          // (reconciled transactions or no change detected)
          current_trx.ignored = entry?.ignored || false;

          current_trx.selected = !current_trx.ignored;
          current_trx.selected_merge = current_trx.existing;

          next = next.concat({ ...current_trx });

          if (existing_trx) {
            // add the updated existing transaction in the list, with the
            // isMatchedTransaction flag to identify it in display and not send it again
            existing_trx.isMatchedTransaction = true;
            existing_trx.category = categories.list.find(
              cat => cat.id === existing_trx.category,
            )?.name;
            // add parent transaction attribute to mimic behaviour
            existing_trx.trx_id = current_trx.trx_id;
            existing_trx.existing = current_trx.existing;
            existing_trx.selected = current_trx.selected;
            existing_trx.selected_merge = current_trx.selected_merge;

            next = next.concat({ ...existing_trx });
          }

          return next;
        }, []);

      console.log('[getImportPreview] Returning preview transactions:', result.length);
      console.log('[getImportPreview] Sample transaction:', result[0]);
      return result;
    },
    [accountId, categories.list, clearOnImport, dispatch],
  );

  const parse = useCallback(
    async (filename: string, options: ParseFileOptions) => {
      setLoadingState('parsing');

      const filetype = getFileType(filename);
      setFilename(filename);
      setFileType(filetype);

      const { errors, transactions: parsedTransactions = [] } = await send(
        'transactions-parse-file',
        {
          filepath: filename,
          options,
        },
      );

      let index = 0;
      const transactions = parsedTransactions.map(trans => {
        // Add a transient transaction id to match preview with imported transactions
        // @ts-expect-error - trans is unknown type, adding properties dynamically
        trans.trx_id = String(index++);
        // Select all parsed transactions before first preview run
        // @ts-expect-error - trans is unknown type, adding properties dynamically
        trans.selected = true;
        return trans;
      });

      setLoadingState(null);
      setError(null);

      /// Do fine grained reporting between the old and new OFX importers.
      if (errors.length > 0) {
        setError({
          parsed: true,
          message: errors[0].message || 'Internal error',
        });
      } else {
        let flipAmount = false;
        let fieldMappings = null;
        let splitMode = false;
        let parseDateFormat: string | null = null;

        if (filetype === 'csv' || filetype === 'qif') {
          flipAmount =
            String(prefs[`flip-amount-${accountId}-${filetype}`]) === 'true';
          setFlipAmount(flipAmount);
        }

        if (filetype === 'csv') {
          let mappings = prefs[`csv-mappings-${accountId}`];
          mappings = mappings
            ? JSON.parse(mappings)
            : getInitialMappings(transactions);

          fieldMappings = mappings;
          // @ts-expect-error - mappings might not have outflow/inflow properties
          setFieldMappings(mappings);

          // Set initial split mode based on any saved mapping
          // @ts-expect-error - mappings might not have outflow/inflow properties
          splitMode = !!(mappings.outflow || mappings.inflow);
          setSplitMode(splitMode);

          parseDateFormat =
            prefs[`parse-date-${accountId}-${filetype}`] ||
            getInitialDateFormat(transactions, mappings);
          setParseDateFormat(
            isDateFormat(parseDateFormat) ? parseDateFormat : null,
          );
        } else if (filetype === 'qif') {
          parseDateFormat =
            prefs[`parse-date-${accountId}-${filetype}`] ||
            getInitialDateFormat(transactions, { date: 'date' });
          setParseDateFormat(
            isDateFormat(parseDateFormat) ? parseDateFormat : null,
          );
        } else {
          setFieldMappings(null);
          setParseDateFormat(null);
        }

        // Reverse the transactions because it's very common for them to
        // be ordered ascending, but we show transactions descending by
        // date. This is purely cosmetic.
        console.log('[parse] About to call getImportPreview with transactions:', transactions.length);
        const transactionPreview = await getImportPreview(
          transactions.reverse(),
          filetype,
          flipAmount,
          fieldMappings,
          splitMode,
          isDateFormat(parseDateFormat) ? parseDateFormat : null,
          inOutMode,
          outValue,
          multiplierAmount,
        );
        console.log('[parse] getImportPreview returned:', transactionPreview.length, 'transactions');
        console.log('[parse] Calling setTransactions...');
        setTransactions(transactionPreview);
        console.log('[parse] setTransactions called successfully');
      }
    },
    // We use some state variables from the component, but do not want to re-parse when they change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, getImportPreview, prefs],
  );

  function onMultiplierChange(e) {
    const amt = e;
    if (!amt || amt.match(/^\d{1,}(\.\d{0,4})?$/)) {
      setMultiplierAmount(amt);
      runImportPreview();
    }
  }

  useEffect(() => {
    const fileType = getFileType(originalFileName);
    const parseOptions = getParseOptions(fileType, {
      delimiter,
      hasHeaderRow,
      skipLines,
      fallbackMissingPayeeToMemo,
      importNotes,
    });

    parse(originalFileName, parseOptions);
  }, [
    originalFileName,
    delimiter,
    hasHeaderRow,
    skipLines,
    fallbackMissingPayeeToMemo,
    importNotes,
    // parse removed from dependencies to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  function onSplitMode() {
    if (fieldMappings == null) {
      return;
    }

    const isSplit = !splitMode;
    setSplitMode(isSplit);

    // Run auto-detection on the fields to try to detect the fields
    // automatically
    const mappings = getInitialMappings(transactions);

    const newFieldMappings = isSplit
      ? {
          amount: null,
          outflow: mappings.amount,
          inflow: null,
        }
      : {
          amount: mappings.amount,
          outflow: null,
          inflow: null,
        };
    setFieldMappings({ ...fieldMappings, ...newFieldMappings });
  }

  async function onNewFile() {
    const res = await window.Actual.openFileDialog({
      filters: [
        {
          name: 'Financial Files',
          extensions: ['qif', 'ofx', 'qfx', 'csv', 'tsv', 'xml', 'pdf'],
        },
      ],
    });

    const fileType = getFileType(res[0]);
    const parseOptions = getParseOptions(fileType, {
      delimiter,
      hasHeaderRow,
      skipLines,
      fallbackMissingPayeeToMemo,
      importNotes,
    });

    parse(res[0], parseOptions);
  }

  function onUpdateFields(field, name) {
    const newFieldMappings = {
      ...fieldMappings,
      [field]: name === '' ? null : name,
    };
    setFieldMappings(newFieldMappings);
    runImportPreview();
  }

  function onCheckTransaction(trx_id: string) {
    const newTransactions = transactions.map(trans => {
      if (trans.trx_id === trx_id) {
        if (trans.existing) {
          // 3-states management for transactions with existing (merged transactions)
          // flow of states:
          // (selected true && selected_merge true)
          //   => (selected true && selected_merge false)
          //     => (selected false)
          //       => back to (selected true && selected_merge true)
          if (!trans.selected) {
            return {
              ...trans,
              selected: true,
              selected_merge: true,
            };
          } else if (trans.selected_merge) {
            return {
              ...trans,
              selected: true,
              selected_merge: false,
            };
          } else {
            return {
              ...trans,
              selected: false,
              selected_merge: false,
            };
          }
        } else {
          return {
            ...trans,
            selected: !trans.selected,
          };
        }
      }
      return trans;
    });

    setTransactions(newTransactions);
  }

  // Agent 2: Suggest categories using AI
  async function onSuggestCategories() {
    try {
      setIsLoadingAgent2(true);

      // Step 1: Check if Agent Server is available
      const isHealthy = await checkAgentServerHealth();
      if (!isHealthy) {
        dispatch(
          addNotification({
            notification: {
              id: 'agent2-health-check-failed',
              type: 'error',
              message: t(
                'Agent Server is not available. Please try again later.',
              ),
            },
          }),
        );
        setIsLoadingAgent2(false);
        return;
      }

      // Step 2: Filter transactions that need categorization (selected, not matched, without category)
      const uncategorizedTransactions = transactions.filter(
        trans =>
          trans.selected &&
          !trans.isMatchedTransaction &&
          (!trans.category || trans.category === 'uncategorized'),
      );

      if (uncategorizedTransactions.length === 0) {
        dispatch(
          addNotification({
            notification: {
              id: 'agent2-no-uncategorized',
              type: 'message',
              message: t('All selected transactions already have categories.'),
            },
          }),
        );
        setIsLoadingAgent2(false);
        return;
      }

      // Step 3: Fetch context data (categories, rules, historical transactions)
      console.log('[ImportTransactionsModal] Fetching Agent 2 context...');
      const context = await fetchAgent2Context(
        uncategorizedTransactions.map(t => ({
          id: String(t.trns_id || t.id || `temp-${Math.random()}`),
          payee: String(t.payee || ''),
          amount:
            typeof t.amount === 'number'
              ? t.amount
              : amountToInteger(t.amount || 0),
          date: String(t.date || ''),
          notes: String(t.notes || ''),
          account: accountId, // Add required field for TransactionEntity
        })) as any, // Cast to avoid type mismatch between ImportTransaction and TransactionEntity
        categories,
      );

      console.log('[ImportTransactionsModal] Context fetched:', {
        categories: context.categories.length,
        rules: context.rules.length,
        historical: context.historicalTransactions.length,
      });

      // Step 4: Call Agent 2
      console.log('[ImportTransactionsModal] Calling Agent 2...');
      const response = await suggestCategoriesWithRetry({
        transactions: uncategorizedTransactions.map(t => ({
          id: String(t.trns_id || t.id || `temp-${Math.random()}`),
          payee_name: String(t.payee || ''),
          payee: String(t.payee || ''),
          amount:
            typeof t.amount === 'number'
              ? t.amount
              : amountToInteger(t.amount || 0),
          date: String(t.date || ''),
          notes: String(t.notes || ''),
        })),
        categories: context.categories,
        rules: context.rules,
        historicalTransactions: context.historicalTransactions,
      });

      console.log('[ImportTransactionsModal] Agent 2 response:', {
        success: response.success,
        suggestions: response.suggestions.length,
        claudeCalls: response.stats?.claudeCalls,
      });

      // Step 5: Show modal with suggestions
      setAgent2Suggestions(response.suggestions);
      setShowAICategorizeModal(true);
      setIsLoadingAgent2(false);
    } catch (error) {
      console.error('[ImportTransactionsModal] Agent 2 error:', error);
      dispatch(
        addNotification({
          notification: {
            id: 'agent2-error',
            type: 'error',
            message: t('Failed to get category suggestions: {{error}}', {
              error: error.message || 'Unknown error',
            }),
          },
        }),
      );
      setIsLoadingAgent2(false);
    }
  }

  // Apply Agent 2 category suggestions
  async function onApplyAgent2Suggestions(
    appliedCategories: Map<string, string>,
  ) {
    console.log(
      '[ImportTransactionsModal] Applying Agent 2 suggestions:',
      appliedCategories.size,
    );

    // Update transactions with selected categories
    const updatedTransactions = transactions.map(trans => {
      const transId = String(trans.trns_id || trans.id || '');
      if (appliedCategories.has(transId)) {
        return {
          ...trans,
          category: appliedCategories.get(transId),
        };
      }
      return trans;
    });

    setTransactions(updatedTransactions);
    setShowAICategorizeModal(false);

    dispatch(
      addNotification({
        notification: {
          id: 'agent2-applied',
          type: 'message',
          message: t('Applied {{count}} category suggestions', {
            count: appliedCategories.size,
          }),
        },
      }),
    );
  }

  async function onImport(close) {
    setLoadingState('importing');

    const finalTransactions = [];
    let errorMessage;

    for (let trans of transactions) {
      if (
        trans.isMatchedTransaction ||
        (reconcile && !trans.selected && !trans.ignored)
      ) {
        // skip transactions that are
        // - matched transaction (existing transaction added to show update changes)
        // - unselected transactions that are not ignored by the reconcilation algorithm (only when reconcilation is enabled)
        continue;
      }

      trans = fieldMappings ? applyFieldMappings(trans, fieldMappings) : trans;

      const date =
        isOfxFile(filetype) || isCamtFile(filetype) || isPdfFile(filetype)
          ? trans.date
          : parseDate(trans.date, parseDateFormat);
      if (date == null) {
        errorMessage = t(
          'Unable to parse date {{date}} with given date format',
          { date: trans.date || t('(empty)') },
        );
        break;
      }

      const { amount } = parseAmountFields(
        trans,
        splitMode,
        isOfxFile(filetype) ? false : inOutMode,
        outValue,
        flipAmount,
        multiplierAmount,
      );
      if (amount == null) {
        errorMessage = t('Transaction on {{date}} has no amount', {
          date: trans.date,
        });
        break;
      }

      const category_id = parseCategoryFields(trans, categories.list);
      trans.category = category_id;

      const {
        inflow,
        outflow,
        inOut,
        existing,
        ignored,
        selected,
        selected_merge,
        trx_id,
        ...finalTransaction
      } = trans;

      if (
        reconcile &&
        ((trans.ignored && trans.selected) ||
          (trans.existing && trans.selected && !trans.selected_merge))
      ) {
        // in reconcile mode, force transaction add for
        // - ignored transactions (aleardy existing) that are checked
        // - transactions with existing (merged transactions) that are not selected_merge
        finalTransaction.forceAddTransaction = true;
      }

      finalTransactions.push({
        ...finalTransaction,
        date,
        amount: amountToInteger(amount),
        cleared: clearOnImport,
        notes: importNotes ? finalTransaction.notes : null,
      });
    }

    if (errorMessage) {
      setLoadingState(null);
      setError({ parsed: false, message: errorMessage });
      return;
    }

    if (!isOfxFile(filetype) && !isCamtFile(filetype) && !isPdfFile(filetype)) {
      const key = `parse-date-${accountId}-${filetype}`;
      savePrefs({ [key]: parseDateFormat });
    }

    if (isOfxFile(filetype)) {
      savePrefs({
        [`ofx-fallback-missing-payee-${accountId}`]: String(
          fallbackMissingPayeeToMemo,
        ),
      });
    }

    if (filetype === 'csv') {
      savePrefs({
        [`csv-mappings-${accountId}`]: JSON.stringify(fieldMappings),
      });
      savePrefs({ [`csv-delimiter-${accountId}`]: delimiter });
      savePrefs({ [`csv-has-header-${accountId}`]: String(hasHeaderRow) });
      savePrefs({ [`csv-skip-lines-${accountId}`]: String(skipLines) });
      savePrefs({ [`csv-in-out-mode-${accountId}`]: String(inOutMode) });
      savePrefs({ [`csv-out-value-${accountId}`]: String(outValue) });
    }

    if (filetype === 'csv' || filetype === 'qif') {
      savePrefs({
        [`flip-amount-${accountId}-${filetype}`]: String(flipAmount),
        [`import-notes-${accountId}-${filetype}`]: String(importNotes),
      });
    }

    const didChange = await dispatch(
      importTransactions({
        accountId,
        transactions: finalTransactions,
        reconcile,
      }),
    ).unwrap();
    if (didChange) {
      await dispatch(reloadPayees());
    }

    if (onImported) {
      onImported(didChange);
    }
    close();
  }

  const runImportPreview = useCallback(async () => {
    const transactionPreview = await getImportPreview(
      transactions,
      filetype,
      flipAmount,
      fieldMappings,
      splitMode,
      parseDateFormat,
      inOutMode,
      outValue,
      multiplierAmount,
    );

    if (!deepEqual(transactions, transactionPreview)) {
      setTransactions(transactionPreview);
    }
  }, [
    getImportPreview,
    transactions,
    filetype,
    flipAmount,
    fieldMappings,
    splitMode,
    parseDateFormat,
    inOutMode,
    outValue,
    multiplierAmount,
  ]);

  const headers: ComponentProps<typeof TableHeader>['headers'] = [
    { name: t('Date'), width: 200 },
    { name: t('Payee'), width: 'flex' },
    { name: t('Notes'), width: 'flex' },
    { name: t('Category'), width: 'flex' },
  ];

  if (reconcile) {
    headers.unshift({ name: ' ', width: 31 });
  }
  if (inOutMode) {
    headers.push({
      name: t('In/Out'),
      width: 90,
      style: { textAlign: 'left' },
    });
  }
  if (splitMode) {
    headers.push({
      name: t('Outflow'),
      width: 90,
      style: { textAlign: 'right' },
    });
    headers.push({
      name: t('Inflow'),
      width: 90,
      style: { textAlign: 'right' },
    });
  } else {
    headers.push({
      name: t('Amount'),
      width: 90,
      style: { textAlign: 'right' },
    });
  }

  console.log('[render] transactions state:', transactions.length);
  console.log('[render] error state:', error);
  console.log('[render] error.parsed:', error?.parsed);
  console.log('[render] loadingState:', loadingState);
  console.log('[render] filetype:', filetype);

  const filteredTransactions = transactions.filter(
    trans =>
      !trans.isMatchedTransaction ||
      (trans.isMatchedTransaction && reconcile),
  );
  console.log('[render] Filtered transactions for table:', filteredTransactions.length);
  console.log('[render] Conditional check (!error || !error.parsed):', (!error || !error?.parsed));

  // Get Redux modal state to check isHidden
  const modalState = useSelector((state: { modals: { isHidden: boolean, modalStack: any[] } }) => state.modals);
  const appState = useSelector((state: { app: { loadingText: string | null } }) => state.app);

  console.log('[render] === FINAL STATE BEFORE RETURN ===');
  console.log('[render] FINAL loadingState:', loadingState);
  console.log('[render] FINAL loadingState type:', typeof loadingState);
  console.log('[render] Modal isLoading prop will be:', loadingState === 'parsing');
  console.log('[render] === REDUX MODAL STATE ===');
  console.log('[render] modalState.isHidden:', modalState.isHidden);
  console.log('[render] modalStack length:', modalState.modalStack.length);
  console.log('[render] appState.loadingText:', appState.loadingText);
  console.log('[render] appState.loadingText === null?', appState.loadingText === null);

  return (
    <Modal
      name="import-transactions"
      isLoading={false}
      containerProps={{ style: { width: 800 } }}
    >
      {({ state: { close } }) => {
        console.log('[Modal children] Function called! close type:', typeof close);
        console.log('[Modal children] Will render content now...');
        return (
        <>
          <ModalHeader
            title={
              t('Import transactions') +
              (filetype ? ` (${filetype.toUpperCase()})` : '')
            }
            rightContent={<ModalCloseButton onPress={close} />}
          />
          {error && !error.parsed && (
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ marginRight: 10, color: theme.errorText }}>
                <strong>
                  <Trans>Error:</Trans>
                </strong>{' '}
                {error.message}
              </Text>
            </View>
          )}
          {console.log('[render] BEFORE conditional block, will check:', (!error || !error?.parsed))}
          {(!error || !error.parsed) && (
            <>
              {console.log('[render] INSIDE conditional block - will render table')}
              <View
                style={{
                  flex: 'unset',
                  height: 300,
                  border: '1px solid ' + theme.tableBorder,
                }}
              >
                <TableHeader headers={headers} />
                {console.log('[render] About to render TableWithNavigator with items:', filteredTransactions.length)}

              {/* @ts-expect-error - ImportTransaction is not a TableItem */}
              <TableWithNavigator<ImportTransaction>
                items={filteredTransactions}
                fields={['payee', 'category', 'amount']}
                style={{ backgroundColor: theme.tableHeaderBackground }}
                getItemKey={index => String(index)}
                renderEmpty={() => {
                  console.log('[renderEmpty] Table is empty, no transactions to display');
                  return (
                    <View
                      style={{
                        textAlign: 'center',
                        marginTop: 25,
                        color: theme.tableHeaderText,
                        fontStyle: 'italic',
                      }}
                    >
                      <Trans>No transactions found</Trans>
                    </View>
                  );
                }}
                renderItem={({ item }) => {
                  console.log('[renderItem] Rendering transaction:', item.payee_name);
                  return (
                    <View>
                      <Transaction
                        transaction={item}
                        showParsed={filetype === 'csv' || filetype === 'qif'}
                        parseDateFormat={parseDateFormat}
                        dateFormat={dateFormat}
                        fieldMappings={fieldMappings}
                        splitMode={splitMode}
                        inOutMode={inOutMode}
                        outValue={outValue}
                        flipAmount={flipAmount}
                        multiplierAmount={multiplierAmount}
                        categories={categories.list}
                        onCheckTransaction={onCheckTransaction}
                        reconcile={reconcile}
                      />
                    </View>
                  );
                }}
              />
            </View>
            </>
          )}
          {error && error.parsed && (
            <View
              style={{
                color: theme.errorText,
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <Text style={{ maxWidth: 450, marginBottom: 15 }}>
                <strong>Error:</strong> {error.message}
              </Text>
              {error.parsed && (
                <Button onPress={() => onNewFile()}>
                  <Trans>Select new file...</Trans>
                </Button>
              )}
            </View>
          )}

          {filetype === 'csv' && (
            <View style={{ marginTop: 10 }}>
              <FieldMappings
                transactions={transactions}
                onChange={onUpdateFields}
                mappings={fieldMappings || undefined}
                splitMode={splitMode}
                inOutMode={inOutMode}
                hasHeaderRow={hasHeaderRow}
              />
            </View>
          )}

          {isOfxFile(filetype) && (
            <CheckboxOption
              id="form_fallback_missing_payee"
              checked={fallbackMissingPayeeToMemo}
              onChange={() => {
                setFallbackMissingPayeeToMemo(state => !state);
                parse(
                  filename,
                  getParseOptions('ofx', {
                    fallbackMissingPayeeToMemo: !fallbackMissingPayeeToMemo,
                    importNotes,
                  }),
                );
              }}
            >
              <Trans>Use Memo as a fallback for empty Payees</Trans>
            </CheckboxOption>
          )}

          {filetype !== 'csv' && (
            <CheckboxOption
              id="import_notes"
              checked={importNotes}
              onChange={() => {
                setImportNotes(!importNotes);
                parse(
                  filename,
                  getParseOptions(filetype, {
                    delimiter,
                    hasHeaderRow,
                    skipLines,
                    fallbackMissingPayeeToMemo,
                    importNotes: !importNotes,
                  }),
                );
              }}
            >
              <Trans>Import notes from file</Trans>
            </CheckboxOption>
          )}

          {(isOfxFile(filetype) || isCamtFile(filetype)) && (
            <CheckboxOption
              id="form_dont_reconcile"
              checked={reconcile}
              onChange={() => {
                setReconcile(!reconcile);
              }}
            >
              <Trans>Merge with existing transactions</Trans>
            </CheckboxOption>
          )}

          {/*Import Options */}
          {(filetype === 'qif' || filetype === 'csv') && (
            <View style={{ marginTop: 10 }}>
              <Stack
                direction="row"
                align="flex-start"
                spacing={1}
                style={{ marginTop: 5 }}
              >
                {/* Date Format */}
                <View>
                  {(filetype === 'qif' || filetype === 'csv') && (
                    <DateFormatSelect
                      transactions={transactions}
                      fieldMappings={fieldMappings || undefined}
                      parseDateFormat={parseDateFormat || undefined}
                      onChange={value => {
                        setParseDateFormat(isDateFormat(value) ? value : null);
                        runImportPreview();
                      }}
                    />
                  )}
                </View>

                {/* CSV Options */}
                {filetype === 'csv' && (
                  <View style={{ marginLeft: 10, gap: 5 }}>
                    <SectionLabel title={t('CSV OPTIONS')} />
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: 5,
                        alignItems: 'baseline',
                      }}
                    >
                      <Trans>Delimiter:</Trans>
                      <Select
                        options={[
                          [',', ','],
                          [';', ';'],
                          ['|', '|'],
                          ['\t', 'tab'],
                        ]}
                        value={delimiter}
                        onChange={value => {
                          setDelimiter(value);
                          parse(
                            filename,
                            getParseOptions('csv', {
                              delimiter: value,
                              hasHeaderRow,
                              skipLines,
                              importNotes,
                            }),
                          );
                        }}
                        style={{ width: 50 }}
                      />
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: 5,
                        alignItems: 'baseline',
                      }}
                    >
                      <Trans>Skip lines:</Trans>
                      <Input
                        type="number"
                        value={skipLines}
                        min="0"
                        onChangeValue={value => {
                          setSkipLines(+value);
                          parse(
                            filename,
                            getParseOptions('csv', {
                              delimiter,
                              hasHeaderRow,
                              skipLines: +value,
                              importNotes,
                            }),
                          );
                        }}
                        style={{ width: 50 }}
                      />
                    </label>
                    <CheckboxOption
                      id="form_has_header"
                      checked={hasHeaderRow}
                      onChange={() => {
                        setHasHeaderRow(!hasHeaderRow);
                        parse(
                          filename,
                          getParseOptions('csv', {
                            delimiter,
                            hasHeaderRow: !hasHeaderRow,
                            skipLines,
                            importNotes,
                          }),
                        );
                      }}
                    >
                      <Trans>File has header row</Trans>
                    </CheckboxOption>
                    <CheckboxOption
                      id="clear_on_import"
                      checked={clearOnImport}
                      onChange={() => {
                        setClearOnImport(!clearOnImport);
                      }}
                    >
                      <Trans>Clear transactions on import</Trans>
                    </CheckboxOption>
                    <CheckboxOption
                      id="form_dont_reconcile"
                      checked={reconcile}
                      onChange={() => {
                        setReconcile(!reconcile);
                      }}
                    >
                      <Trans>Merge with existing transactions</Trans>
                    </CheckboxOption>
                  </View>
                )}

                <View style={{ flex: 1 }} />

                <View style={{ marginRight: 10, gap: 5 }}>
                  <SectionLabel title={t('AMOUNT OPTIONS')} />
                  <CheckboxOption
                    id="form_flip"
                    checked={flipAmount}
                    onChange={() => {
                      setFlipAmount(!flipAmount);
                      runImportPreview();
                    }}
                  >
                    <Trans>Flip amount</Trans>
                  </CheckboxOption>
                  <MultiplierOption
                    multiplierEnabled={multiplierEnabled}
                    multiplierAmount={multiplierAmount}
                    onToggle={() => {
                      setMultiplierEnabled(!multiplierEnabled);
                      setMultiplierAmount('');
                      runImportPreview();
                    }}
                    onChangeAmount={onMultiplierChange}
                  />
                  {filetype === 'csv' && (
                    <>
                      <CheckboxOption
                        id="form_split"
                        checked={splitMode}
                        onChange={() => {
                          onSplitMode();
                          runImportPreview();
                        }}
                      >
                        <Trans>
                          Split amount into separate inflow/outflow columns
                        </Trans>
                      </CheckboxOption>
                      <InOutOption
                        inOutMode={inOutMode}
                        outValue={outValue}
                        onToggle={() => {
                          setInOutMode(!inOutMode);
                          runImportPreview();
                        }}
                        onChangeText={setOutValue}
                      />
                    </>
                  )}
                </View>
              </Stack>
            </View>
          )}

          <View style={{ flexDirection: 'row', marginTop: 5 }}>
            {/*Submit Buttons */}
            <View
              style={{
                alignSelf: 'flex-end',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '1em',
              }}
            >
              {/* Agent 2: Suggest Categories Button */}
              {(() => {
                const uncategorizedCount = transactions?.filter(
                  trans =>
                    trans.selected &&
                    !trans.isMatchedTransaction &&
                    (!trans.category || trans.category === 'uncategorized'),
                ).length;

                // Only show button if there are uncategorized transactions
                if (uncategorizedCount > 0 && loadingState !== 'importing') {
                  return (
                    <ButtonWithLoading
                      variant="normal"
                      isDisabled={uncategorizedCount === 0}
                      isLoading={isLoadingAgent2}
                      onPress={onSuggestCategories}
                    >
                      {isLoadingAgent2 ? (
                        <Trans>Getting suggestions...</Trans>
                      ) : (
                        <Trans count={uncategorizedCount}>
                          Suggest categories ({{ count: uncategorizedCount }})
                        </Trans>
                      )}
                    </ButtonWithLoading>
                  );
                }
                return null;
              })()}

              {/* Import Button */}
              {(() => {
                const count = transactions?.filter(
                  trans => !trans.isMatchedTransaction && trans.selected,
                ).length;

                return (
                  <ButtonWithLoading
                    variant="primary"
                    autoFocus
                    isDisabled={count === 0}
                    isLoading={loadingState === 'importing'}
                    onPress={() => {
                      onImport(close);
                    }}
                  >
                    <Trans count={count}>Import {{ count }} transactions</Trans>
                  </ButtonWithLoading>
                );
              })()}
            </View>
          </View>

          {/* Agent 2: Category Suggestions Modal */}
          {showAICategorizeModal && (
            <AICategorizeModal
              transactions={
                transactions
                  .filter(
                    t =>
                      t.selected &&
                      !t.isMatchedTransaction &&
                      (!t.category || t.category === 'uncategorized'),
                  )
                  .map(t => ({
                    id: String(t.trns_id || t.id || ''),
                    payee: String(t.payee || ''),
                    amount:
                      typeof t.amount === 'number'
                        ? t.amount
                        : amountToInteger(t.amount || 0),
                    account: accountId,
                  })) as any
              } // Cast to TransactionEntity[]
              suggestions={agent2Suggestions}
              onApply={onApplyAgent2Suggestions}
              onClose={() => setShowAICategorizeModal(false)}
            />
          )}
        </>
        );
      }}
    </Modal>
  );
}

function getParseOptions(fileType: string, options: ParseFileOptions = {}) {
  if (fileType === 'csv') {
    const { delimiter, hasHeaderRow, skipLines } = options;
    return { delimiter, hasHeaderRow, skipLines };
  }
  if (isOfxFile(fileType)) {
    const { fallbackMissingPayeeToMemo, importNotes } = options;
    return { fallbackMissingPayeeToMemo, importNotes };
  }
  if (isCamtFile(fileType)) {
    const { importNotes } = options;
    return { importNotes };
  }
  const { importNotes } = options;
  return { importNotes };
}

function isOfxFile(fileType: string) {
  return fileType === 'ofx' || fileType === 'qfx';
}

function isCamtFile(fileType: string) {
  return fileType === 'xml';
}

function isPdfFile(fileType: string) {
  return fileType === 'pdf';
}
