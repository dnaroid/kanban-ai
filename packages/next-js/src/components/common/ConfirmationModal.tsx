import React from 'react';
import { Modal } from './Modal';
import { AlertCircle, Trash2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Common Confirmation Modal for safe delete or important actions
 */

interface ConfirmationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void | Promise<void>;
	title: string;
	description: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: 'danger' | 'warning' | 'info';
	isLoading?: boolean;
}

export const ConfirmationModal = ({
	isOpen,
	onClose,
	onConfirm,
	title,
	description,
	confirmLabel = 'Confirm',
	cancelLabel = 'Cancel',
	variant = 'danger',
	isLoading = false,
}: ConfirmationModalProps) => {
	const getVariantStyles = () => {
		switch (variant) {
			case 'danger':
				return {
					icon: Trash2,
					iconBg: 'bg-red-500/10',
					iconText: 'text-red-400',
					confirmBtn: 'bg-red-600 hover:bg-red-500 shadow-red-600/20',
				};
			case 'warning':
				return {
					icon: AlertCircle,
					iconBg: 'bg-amber-500/10',
					iconText: 'text-amber-400',
					confirmBtn: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20',
				};
			default:
				return {
					icon: HelpCircle,
					iconBg: 'bg-blue-500/10',
					iconText: 'text-blue-400',
					confirmBtn: 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20',
				};
		}
	};

	const styles = getVariantStyles();
	const Icon = styles.icon;

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			size="sm"
			className="max-w-md"
			title={
				<div className="flex items-center gap-3">
					<div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", styles.iconBg)}>
						<Icon className={cn("w-5 h-5", styles.iconText)} />
					</div>
					<h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
				</div>
			}
			footer={
				<div className="flex gap-3 w-full">
					<button
						type="button"
						onClick={onClose}
						disabled={isLoading}
						className="flex-1 px-4 py-2.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all border border-slate-800/60"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={async () => {
							await onConfirm();
							onClose();
						}}
						disabled={isLoading}
						className={cn(
							"flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wide rounded-lg shadow-lg transition-all text-white",
							styles.confirmBtn,
							"active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
						)}
					>
						{isLoading ? 'Processing...' : confirmLabel}
					</button>
				</div>
			}
		>
			<p className="text-sm text-slate-400 leading-relaxed px-1">
				{description}
			</p>
		</Modal>
	);
};
