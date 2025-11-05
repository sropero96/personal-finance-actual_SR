/**
 * AICategorizeModal
 *
 * Modal for AI-powered category suggestions using Agent 2.
 * Displays category suggestions with confidence scores and reasoning,
 * allowing users to review and apply suggestions selectively.
 */

import { useState, useMemo, useCallback } from 'react';
import { Trans , useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
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

  // FIX V59: Sort suggestions by confidence (descending) - show all ordered
  const sortedSuggestions = useMemo(() => {
    return [...suggestions].sort((a, b) => b.confidence - a.confidence);
  }, [suggestions]);

  // FIX V59: Debug logging for ID verification
  useMemo(() => {
    const transactionIds = transactions.map(t => t.id);
    const suggestionIds = suggestions.map(s => s.transaction_id);
    const mismatches = suggestions.filter(s => !transactionMap.has(s.transaction_id));

    console.log('[AICategorizeModal V59] Debug:', {
      transactionCount: transactions.length,
      suggestionCount: suggestions.length,
      transactionIds: transactionIds.slice(0, 5),
      suggestionIds: suggestionIds.slice(0, 5),
      mismatchCount: mismatches.length,
      mismatches: mismatches.slice(0, 3).map(s => s.transaction_id),
    });
    return null;
  }, [transactions, suggestions, transactionMap]);

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
        if (selectedIds.has(sug.transaction_id) && sug.category) {
          // FIX V65: Use category NAME instead of ID (Transaction component expects name)
          appliedCategories.set(sug.transaction_id, sug.category);
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
  // FIX V59: Show total count of ALL suggestions, not filtered by categoryId
  const totalSuggestions = suggestions.length;

  return (
    <Modal
      name="ai-categorize"
      containerProps={{
        style: {
          width: 700,
          maxWidth: '90vw',
          height: '85vh',
          maxHeight: 700,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden', // FIX V61: Prevent double scroll context
        },
      }}
    >
      <ModalHeader
        title={t('AI Category Suggestions')}
        rightContent={<ModalCloseButton onPress={onClose} />}
      />

      {/* FIX V61: Force pointerEvents to enable clicks */}
      <View
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          pointerEvents: 'auto', // FIX V61: Override modal's pointerEvents: 'none'
        }}
      >
        {/* FIX V66: Remove gap (doesn't work with Vite CSS-in-JS) - use marginBottom on children */}
        <View
          style={{
            display: 'flex',
            flexDirection: 'column',
            // FIX V66: Removed gap: 20 - causes card stacking when many suggestions
            padding: 20,
            paddingTop: 10,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
        {/* Summary Header - FIX V60: Clearer wording */}
        <View
          style={{
            padding: 12,
            backgroundColor: theme.tableRowHeaderBackground,
            borderRadius: 4,
            marginBottom: 20, // FIX V66: Explicit margin for spacing (gap doesn't work)
          }}
        >
          <Text style={{ fontWeight: 600, fontSize: 14 }}>
            {t('{{total}} suggestions processed', { total: totalSuggestions })}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: theme.pageTextSubdued,
              marginTop: 4,
            }}
          >
            {selectedCount > 0
              ? t('{{count}} selected for import', { count: selectedCount })
              : t('Select transactions to apply suggestions')}
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

        {/* Suggestions List - FIX V72: Force max-content height per row */}
        <View
          style={{
            display: 'grid',
            gridAutoFlow: 'row',
            gridTemplateColumns: '1fr',
            rowGap: 20,
            gridAutoRows: 'max-content', // FIX V72: Force each row to take full content height
            alignContent: 'start',
          }}
        >
        {sortedSuggestions.map(suggestion => {
          const transaction = transactionMap.get(suggestion.transaction_id);
          const isSelected = selectedIds.has(suggestion.transaction_id);
          const hasCategory = Boolean(suggestion.categoryId);
          const confidencePercent = Math.round(suggestion.confidence * 100);

          return (
            <View key={suggestion.transaction_id} style={{ display: 'block', width: '100%' }}>
              <View
                style={{
                  padding: 16,
                  backgroundColor: isSelected
                    ? theme.tableRowBackgroundHover
                    : theme.tableBackground,
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 4,
                  cursor: hasCategory ? 'pointer' : 'not-allowed',
                  opacity: hasCategory ? 1 : 0.6,
                  overflow: 'visible', // FIX V71: Allow card to grow with content
                  contain: 'layout paint', // FIX V71: Encapsulate layout/paint without clipping
                  isolation: 'isolate',
                  display: 'flow-root',
                }}
                onClick={() =>
                  hasCategory && toggleSelection(suggestion.transaction_id)
                }
              >
              {/* FIX V68: Removed position/zIndex that were causing text escape */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                {/* Checkbox icon - FIX V60: Larger and more visible */}
                {hasCategory && (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      border: `2px solid ${isSelected ? theme.noticeTextLight : theme.tableBorder}`,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected
                        ? theme.noticeTextLight
                        : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {isSelected && (
                      <Text
                        style={{
                          color: 'white',
                          fontSize: 16,
                          fontWeight: 'bold',
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                )}

                {/* Transaction Info - FIX V72: Added alignSelf stretch */}
                <View style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 60,
                  minWidth: 0,
                  alignSelf: 'stretch', // FIX V72: Stretch to fill parent height
                }}>
                  {/* FIX V65: Payee/Amount row with marginBottom for spacing */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10, // FIX V63: Increased from 8px to 10px (horizontal gap works better)
                      flexWrap: 'wrap',
                      minHeight: 24,
                      paddingBottom: 2, // FIX V63: Add bottom padding when content wraps
                      marginBottom: 14, // FIX V65: Explicit margin instead of parent gap
                    }}
                  >
                    <Text style={{ fontWeight: 600 }}>
                      {transaction?.imported_payee || transaction?.payee_name || transaction?.payee || suggestion.category || 'Unknown Transaction'}
                    </Text>
                    <Text style={{ color: theme.pageTextSubdued }}>
                      ${Math.abs(transaction?.amount || 0).toFixed(2)}
                    </Text>
                  </View>

                  {/* Suggestion - FIX V71: Force column layout for category + reasoning */}
                  {hasCategory ? (
                    <View style={{
                      display: 'flex',
                      flexDirection: 'column', // FIX V71: Stack category and reasoning vertically
                      alignItems: 'stretch',
                      gap: 8, // FIX V71: Spacing between category row and reasoning
                      minWidth: 0,
                      paddingTop: 8,
                      borderTop: `1px solid ${theme.tableBorder}20`,
                    }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Text>→</Text>
                        <Text
                          style={{
                            fontWeight: 500,
                            color: theme.noticeTextLight,
                          }}
                        >
                          {suggestion.category}
                        </Text>
                        <Text
                          style={{
                            color: getConfidenceColor(suggestion.confidence),
                          }}
                        >
                          {getConfidenceEmoji(suggestion.confidence)}{' '}
                          {confidencePercent}%
                        </Text>
                      </View>
                      {/* FIX V71: Full-width block with aggressive wrapping */}
                      <Text
                        style={{
                          display: 'block',
                          width: '100%',
                          alignSelf: 'stretch',
                          whiteSpace: 'normal',
                          fontSize: 12,
                          color: theme.pageTextSubdued,
                          lineHeight: 1.6,
                          paddingLeft: 16,
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
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
            </View>
          );
        })}
        </View>

        {/* FIX V60: Scroll indicator when many suggestions */}
        {totalSuggestions > 5 && (
          <Text
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: theme.pageTextSubdued,
              padding: 8,
              fontStyle: 'italic',
            }}
          >
            ↕ Scroll to see all {totalSuggestions} suggestions
          </Text>
        )}
      </View>

      {/* FIX V62: Move buttons INSIDE pointerEvents wrapper so they receive clicks */}
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
        <Button onPress={onClose} isDisabled={isApplying}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          variant="primary"
          onPress={handleApply}
          isDisabled={selectedCount === 0 || isApplying}
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
      </View>

    </Modal>
  );
}
