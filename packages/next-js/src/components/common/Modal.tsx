import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import React from 'react';

/**
 * Common Modal component based on Radix UI Dialog
 */

interface ModalProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger?: React.ReactNode;
	title?: React.ReactNode;
	description?: React.ReactNode;
	children: React.ReactNode;
	footer?: React.ReactNode;
	className?: string;
	contentClassName?: string;
	size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | '720px' | 'none';
}

const sizeClasses = {
	sm: 'w-full max-w-md',
	md: 'w-full max-w-lg',
	lg: 'w-full max-w-2xl',
	xl: 'w-full max-w-4xl',
	full: 'w-full max-w-[95vw]',
	'720px': 'w-[720px]',
	none: '',
};

export const Modal = ({
	open,
	onOpenChange,
	trigger,
	title,
	description,
	children,
	footer,
	className,
	contentClassName,
	size = '720px',
}: ModalProps) => {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			{trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" />
				<Dialog.Content
					className={cn(
						'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51]',
						size !== 'none' && sizeClasses[size],
						'bg-[#0B0E14] border border-slate-800/60 rounded-2xl shadow-2xl p-6 space-y-4',
						'animate-in zoom-in-95 fade-in duration-200 focus:outline-none focus-visible:ring-0',
						className
					)}
				>
					{(title || onOpenChange) && (
						<div className="flex items-center justify-between">
							{title ? (
								<Dialog.Title className="text-xl font-bold text-white tracking-tight">
									{title}
								</Dialog.Title>
							) : (
								<div />
							)}
							<Dialog.Close asChild>
								<button className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all focus:outline-none">
									<X className="w-5 h-5" />
								</button>
							</Dialog.Close>
						</div>
					)}

					{description && (
						<Dialog.Description className="text-sm text-slate-400">
							{description}
						</Dialog.Description>
					)}

					<div className={cn('relative', contentClassName)}>{children}</div>

					{footer && <div className="flex gap-3 pt-2 justify-end">{footer}</div>}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
};

// Re-exporting Radix components for more granular control if needed
export const ModalRoot = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalPortal = Dialog.Portal;
export const ModalOverlay = ({ className, ...props }: Dialog.DialogOverlayProps) => (
	<Dialog.Overlay
		className={cn(
			'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200',
			className
		)}
		{...props}
	/>
);
export const ModalContent = ({ className, size = '720px', ...props }: Dialog.DialogContentProps & { size?: keyof typeof sizeClasses }) => (
	<Dialog.Content
		className={cn(
			'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51]',
			size !== 'none' && sizeClasses[size],
			'bg-[#0B0E14] border border-slate-800/60 rounded-2xl shadow-2xl p-6 space-y-4',
			'animate-in zoom-in-95 fade-in duration-200 focus:outline-none focus-visible:ring-0',
			className
		)}
		{...props}
	/>
);
export const ModalTitle = Dialog.Title;
export const ModalDescription = Dialog.Description;
export const ModalClose = Dialog.Close;
