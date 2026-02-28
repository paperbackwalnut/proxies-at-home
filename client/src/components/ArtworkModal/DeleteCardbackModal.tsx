import { createPortal } from "react-dom";
import { Button, Checkbox, Label } from "flowbite-react";

interface DeleteCardbackModalProps {
    pendingDeleteId: string | null;
    pendingDeleteName: string;
    defaultCardbackId: string;
    dontShowAgain: boolean;
    onDontShowAgainChange: (checked: boolean) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export function DeleteCardbackModal({
    pendingDeleteId,
    pendingDeleteName,
    defaultCardbackId,
    dontShowAgain,
    onDontShowAgainChange,
    onConfirm,
    onCancel,
}: DeleteCardbackModalProps) {
    if (!pendingDeleteId) return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[20000] bg-gray-900/50 flex items-center justify-center"
            onClick={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) {
                    onCancel();
                }
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div
                className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
                    Delete Cardback?
                </div>
                <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
                    Are you sure you want to delete &quot;{pendingDeleteName}&quot;?
                    {pendingDeleteId === defaultCardbackId && (
                        <span className="block mt-2 font-medium text-amber-600 dark:text-amber-400">
                            This is your default cardback. A new default will be assigned.
                        </span>
                    )}
                </div>
                <div className="flex items-center justify-center gap-2 mb-5">
                    <Checkbox
                        id="dont-show-again"
                        checked={dontShowAgain}
                        onChange={(e) => onDontShowAgainChange(e.target.checked)}
                    />
                    <Label
                        htmlFor="dont-show-again"
                        className="text-sm text-gray-500 dark:text-gray-400"
                    >
                        Don&apos;t show this again
                    </Label>
                </div>
                <div className="flex justify-center gap-4">
                    <Button
                        color="failure"
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={onConfirm}
                    >
                        Yes, delete
                    </Button>
                    <Button color="gray" onClick={onCancel}>
                        No, cancel
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
