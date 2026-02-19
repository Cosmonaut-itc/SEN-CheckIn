'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Props for signature capture dialog.
 */
export interface SignatureCanvasDialogProps {
	/** Controls dialog visibility. */
	open: boolean;
	/** Callback for open state changes. */
	onOpenChange: (open: boolean) => void;
	/** Dialog title. */
	title: string;
	/** Dialog description. */
	description: string;
	/** Label used for clear action. */
	clearLabel: string;
	/** Label used for confirm action. */
	confirmLabel: string;
	/** Label used for cancel action. */
	cancelLabel: string;
	/** Callback fired with signature data URL. */
	onConfirm: (signatureDataUrl: string) => Promise<void> | void;
	/** Loading state for confirm button. */
	isPending?: boolean;
}

/**
 * Signature canvas modal for capturing handwritten signatures.
 *
 * @param props - Signature dialog props
 * @returns Signature dialog component
 */
export function SignatureCanvasDialog({
	open,
	onOpenChange,
	title,
	description,
	clearLabel,
	confirmLabel,
	cancelLabel,
	onConfirm,
	isPending = false,
}: SignatureCanvasDialogProps): React.ReactElement {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [isDrawing, setIsDrawing] = useState<boolean>(false);
	const [hasSignature, setHasSignature] = useState<boolean>(false);

	/**
	 * Resolves signature stroke color from the active design token theme.
	 *
	 * @returns Canvas stroke color
	 */
	const getSignatureStrokeColor = useCallback((): string => {
		if (typeof window === 'undefined') {
			return '#2B1810';
		}

		const computed = getComputedStyle(document.documentElement)
			.getPropertyValue('--text-primary')
			.trim();
		return computed || '#2B1810';
	}, []);

	/**
	 * Resolves canvas and rendering context.
	 *
	 * @returns Canvas rendering context or null
	 */
	const getCanvasContext = useCallback((): CanvasRenderingContext2D | null => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return null;
		}
		const context = canvas.getContext('2d');
		if (!context) {
			return null;
		}
		return context;
	}, []);

	/**
	 * Maps pointer coordinates to canvas space.
	 *
	 * @param event - Pointer event
	 * @returns Canvas-relative x/y coordinates
	 */
	const getPointerPosition = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
			const canvas = canvasRef.current;
			if (!canvas) {
				return { x: 0, y: 0 };
			}
			const rect = canvas.getBoundingClientRect();
			return {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
		},
		[],
	);

	/**
	 * Starts pointer drawing interaction.
	 *
	 * @param event - Pointer event
	 * @returns Nothing
	 */
	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>): void => {
			const context = getCanvasContext();
			if (!context) {
				return;
			}

			const { x, y } = getPointerPosition(event);
			context.beginPath();
			context.moveTo(x, y);
			context.lineWidth = 2;
			context.lineCap = 'round';
			context.strokeStyle = getSignatureStrokeColor();
			setIsDrawing(true);
		},
		[getCanvasContext, getPointerPosition, getSignatureStrokeColor],
	);

	/**
	 * Continues pointer drawing interaction.
	 *
	 * @param event - Pointer event
	 * @returns Nothing
	 */
	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>): void => {
			if (!isDrawing) {
				return;
			}

			const context = getCanvasContext();
			if (!context) {
				return;
			}

			const { x, y } = getPointerPosition(event);
			context.lineTo(x, y);
			context.stroke();
			setHasSignature(true);
		},
		[getCanvasContext, getPointerPosition, isDrawing],
	);

	/**
	 * Ends pointer drawing interaction.
	 *
	 * @returns Nothing
	 */
	const handlePointerUp = useCallback((): void => {
		setIsDrawing(false);
	}, []);

	/**
	 * Clears the signature canvas.
	 *
	 * @returns Nothing
	 */
	const handleClear = useCallback((): void => {
		const canvas = canvasRef.current;
		const context = getCanvasContext();
		if (!canvas || !context) {
			return;
		}

		context.clearRect(0, 0, canvas.width, canvas.height);
		setHasSignature(false);
	}, [getCanvasContext]);

	/**
	 * Confirms the signature capture.
	 *
	 * @returns Nothing
	 */
	const handleConfirm = useCallback(async (): Promise<void> => {
		const canvas = canvasRef.current;
		if (!canvas || !hasSignature) {
			return;
		}

		const signatureDataUrl = canvas.toDataURL('image/png');
		await onConfirm(signatureDataUrl);
	}, [hasSignature, onConfirm]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className="rounded-md border bg-white p-2">
					<canvas
						ref={canvasRef}
						width={720}
						height={240}
						className="h-[220px] w-full touch-none rounded border bg-white"
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerLeave={handlePointerUp}
					/>
				</div>
				<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={handleClear} disabled={isPending}>
							{clearLabel}
						</Button>
						<Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
							{cancelLabel}
						</Button>
					</div>
					<Button type="button" onClick={() => void handleConfirm()} disabled={!hasSignature || isPending}>
						{isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{confirmLabel}
							</>
						) : (
							confirmLabel
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
