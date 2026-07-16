import { Loader2 } from 'lucide-react';

export default function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Loader2 size={28} className="animate-spin text-yellow-500" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-ping" />
          </div>
        </div>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
