// PLACEHOLDER — replaced by self-return's data-integration sub-task
// (docs/mvp/01-mvp.md → feature #1 "Self-return books" → "Data integration").
// Shaped to match the real `returnBook` server action this will become:
// it resolves to { success, error? } so the UI's returning/returned/error
// states are fully built now and swapping to the real action is a one-line change.

export interface ReturnBookParams {
  recordId: string;
  bookId: string;
}

export interface ReturnBookResult {
  success: boolean;
  error?: string;
}

// Flip to `true` to exercise the error UI path against placeholder data.
// The real action will surface genuine failures (already returned, not the
// caller's record, DB error) through the same { success: false, error } shape.
const FORCE_ERROR = false;

const LATENCY_MS = 1200;

export const returnBookPlaceholder = async (
  _params: ReturnBookParams
): Promise<ReturnBookResult> => {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

  if (FORCE_ERROR) {
    return {
      success: false,
      error: "Couldn't return this book. Please try again.",
    };
  }

  return { success: true };
};
