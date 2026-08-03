export function BrandMark({ compact = false }: { compact?: boolean }) {
	return (
		<span className="brand-mark" aria-hidden="true">
			<span className="brand-mark-box">P</span>
			{compact ? null : <span className="brand-word">Pakitup</span>}
		</span>
	);
}
