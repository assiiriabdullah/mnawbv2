import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Eraser, Undo } from 'lucide-react';

interface SignaturePadProps {
  width?: number;
  height?: number;
  onChange?: (data: string | null) => void;
  initialData?: string | null;
}

export interface SignaturePadRef {
  getData: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(({ width = 400, height = 180, onChange, initialData }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const getCtx = () => canvasRef.current?.getContext('2d');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (initialData) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0); setHasContent(true); };
      img.src = initialData;
    }
  }, [initialData]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    lastPoint.current = getPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx || !lastPoint.current) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
    setHasContent(true);
  };

  const endDraw = () => {
    setIsDrawing(false);
    lastPoint.current = null;
    if (hasContent && onChange) onChange(canvasRef.current?.toDataURL('image/png') || null);
  };

  const clear = () => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    setHasContent(false);
    onChange?.(null);
  };

  useImperativeHandle(ref, () => ({
    getData: () => hasContent ? (canvasRef.current?.toDataURL('image/png') || null) : null,
    clear,
    isEmpty: () => !hasContent,
  }));

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-white" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full cursor-crosshair"
          style={{ height: height * 0.8 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm">وقّع هنا</p>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <button onClick={clear} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
          <Eraser size={14} /> مسح التوقيع
        </button>
      </div>
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;
