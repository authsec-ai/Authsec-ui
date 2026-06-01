import React from "react";
import toast from "react-hot-toast";

export interface ToastWithUndoOptions {
  message: string;
  onUndo: () => void;
  duration?: number;
}

/**
 * toastWithUndo — displays a dismissible toast with an Undo action button.
 *
 * Usage:
 *   toastWithUndo({
 *     message: "User suspended",
 *     onUndo: () => reactivateUser(userId),
 *   });
 */
export function toastWithUndo({
  message,
  onUndo,
  duration = 5000,
}: ToastWithUndoOptions): void {
  toast(
    (t) => (
      <span className="flex items-center gap-3">
        <span>{message}</span>
        <button
          type="button"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
          onClick={() => {
            onUndo();
            toast.dismiss(t.id);
          }}
        >
          Undo
        </button>
      </span>
    ),
    { duration }
  );
}
