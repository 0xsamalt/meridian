export function MeridianLogo({ className = "" }: { className?: string }) {
    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            <svg width="32" height="28" viewBox="0 0 32 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="13" cy="14" r="10" stroke="#93C5FD" strokeWidth="3.5" fill="none" />
                <circle cx="19" cy="14" r="10" stroke="#3B82F6" strokeWidth="3.5" fill="none" />
            </svg>
            <span className="text-[20px] font-semibold text-meridian-text-primary tracking-tight">
                Meridian
            </span>
        </div>
    );
}