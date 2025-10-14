/**
 * AICategorizeModal
 *
 * Modal for AI-powered category suggestions using Agent 2.
 * Displays category suggestions with confidence scores and reasoning,
 * allowing users to review and apply suggestions selectively.
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import { Stack } from '@actual-app/components/stack';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { type TransactionEntity } from 'loot-core/types/models';

import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { type Agent2Suggestion } from '@desktop-client/util/agent2-service';

type AICategorizeModalProps = {
  transactions: TransactionEntity[];
  suggestions: Agent2Suggestion[];
  onApply: (appliedSuggestions: Map<string, string>) => Promise<void>;
  onClose: () => void;
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return theme.noticeTextLight; // Green
  if (confidence >= 0.7) return theme.warningText; // Yellow
  return theme.errorText; // Red
}

function getConfidenceEmoji(confidence: number): string {
  if (confidence >= 0.9) return '🟢';
  if (confidence >= 0.7) return '🟡';
  return '🔴';
}

export function AICategorizeModal({
  transactions,
  suggestions,
  onApply,
  onClose,
}: AICategorizeModalProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Pre-select high-confidence suggestions
    const selected = new Set<string>();
    suggestions.forEach(sug => {
      if (sug.confidence >= 0.85 && sug.categoryId) {
        selected.add(sug.transaction_id);
      }
    });
    return selected;
  });
  const [isApplying, setIsApplying] = useState(false);

  // Create transaction lookup map
  const transactionMap = useMemo(() => {
    const map = new Map<string, TransactionEntity>();
    transactions.forEach(tx => map.set(tx.id, tx));
    return map;
  }, [transactions]);

  // Toggle selection for a transaction
  const toggleSelection = useCallback((transactionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  }, []);

  // Select all high-confidence suggestions
  const selectAllHighConfidence = useCallback(() => {
    const highConf = new Set<string>();
    suggestions.forEach(sug => {
      if (sug.confidence >= 0.85 && sug.categoryId) {
        highConf.add(sug.transaction_id);
      }
    });
    setSelectedIds(highConf);
  }, [suggestions]);

  // Apply selected suggestions
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      const appliedCategories = new Map<string, string>();

      suggestions.forEach(sug => {
        if (selectedIds.has(sug.transaction_id) && sug.categoryId) {
          appliedCategories.set(sug.transaction_id, sug.categoryId);
        }
      });

      await onApply(appliedCategories);
      onClose();
    } catch (error) {
      console.error('[AICategorizeModal] Error applying suggestions:', error);
      setIsApplying(false);
      // TODO: Show error message to user
    }
  }, [selectedIds, suggestions, onApply, onClose]);

  const selectedCount = selectedIds.size;
  const totalSuggestions = suggestions.filter(s => s.categoryId).length;

  return (
    <Modal name="ai-categorize" style={{ width: 700, height: 600 }}>
      <ModalHeader
        title={t('AI Category Suggestions')}
        rightContent={<ModalCloseButton onPress={onClose} />}
      />

      <Stack
        spacing={3}
        style={{
          padding: 20,
          paddingTop: 10,
          flex: 1,
          overflow: 'auto',
        }}
      >
        {/* Summary Header */}
        <View
          style={{
            padding: 12,
            backgroundColor: theme.tableRowHeaderBackground,
            borderRadius: 4,
          }}
        >
          <Text style={{ fontWeight: 600 }}>
            {t('{{count}} of {{total}} transactions ready to categorize', {
              count: selectedCount,
              total: totalSuggestions,
            })}
          </Text>
          {selectedCount < totalSuggestions && (
            <Button
              variant="bare"
              onPress={selectAllHighConfidence}
              style={{ marginTop: 8 }}
            >
              {t('Select all high confidence (≥85%)')}
            </Button>
          )}
        </View>

        {/* Suggestions List */}
        {suggestions.map(suggestion => {
          const transaction = transactionMap.get(suggestion.transaction_id);
          if (!transaction) return null;

          const isSelected = selectedIds.has(suggestion.transaction_id);
          const hasCategory = Boolean(suggestion.categoryId);
          const confidencePercent = Math.round(suggestion.confidence * 100);

          return (
            <View
              key={suggestion.transaction_id}
              style={{
                padding: 12,
                backgroundColor: isSelected
                  ? theme.tableRowBackgroundHoverSelected
                  : theme.tableBackground,
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 4,
                cursor: hasCategory ? 'pointer' : 'not-allowed',
                opacity: hasCategory ? 1 : 0.6,
              }}
              onClick={() => hasCategory && toggleSelection(suggestion.transaction_id)}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {/* Checkbox icon */}
                {hasCategory && (
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      border: `2px solid ${theme.tableBorder}`,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? theme.noticeTextLight : 'transparent',
                    }}
                  >
                    {isSelected && (
                      <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                        ✓
                      </Text>
                    )}
                  </View>
                )}

                {/* Transaction Info */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontWeight: 600 }}>
                      {transaction.payee_name || transaction.payee || 'Unknown'}
                    </Text>
                    <Text style={{ color: theme.pageTextSubdued }}>
                      ${Math.abs(transaction.amount || 0).toFixed(2)}
                    </Text>
                  </View>

                  {/* Suggestion */}
                  {hasCategory ? (
                    <View style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text>→</Text>
                        <Text style={{ fontWeight: 500, color: theme.noticeTextLight }}>
                          {suggestion.category}
                        </Text>
                        <Text style={{ color: getConfidenceColor(suggestion.confidence) }}>
                          {getConfidenceEmoji(suggestion.confidence)} {confidencePercent}%
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.pageTextSubdued,
                          marginTop: 2,
                        }}
                      >
                        {suggestion.reasoning}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: theme.errorText,
                      }}
                    >
                      ❌ {suggestion.reasoning || 'No suggestion available'}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </Stack>

      {/* Action Buttons */}
      <View
        style={{
          padding: 20,
          paddingTop: 12,
          borderTop: `1px solid ${theme.tableBorder}`,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <Button onPress={onClose} disabled={isApplying}>
          {t('Cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={handleApply}
          disabled={selectedCount === 0 || isApplying}
        >
          {isApplying ? (
            <>
              <AnimatedLoading style={{ width: 16, height: 16 }} />
              {t('Applying...')}
            </>
          ) : (
            t('Apply {{count}} categories', { count: selectedCount })
          )}
        </Button>
      </View>
    </Modal>
  );
}
