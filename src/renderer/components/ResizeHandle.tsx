interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

export function ResizeHandle({ direction, onResize }: ResizeHandleProps): JSX.Element {
  const horizontal = direction === 'horizontal';
  return (
    <div
      className={'resize-handle ' + direction}
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      tabIndex={0}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = horizontal ? event.clientX : event.clientY;
        const move = (moveEvent: PointerEvent): void =>
          onResize((horizontal ? moveEvent.clientX : moveEvent.clientY) - start);
        const stop = (): void => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          event.currentTarget.removeEventListener('pointermove', move);
          event.currentTarget.removeEventListener('pointerup', stop);
        };
        event.currentTarget.addEventListener('pointermove', move);
        event.currentTarget.addEventListener('pointerup', stop);
      }}
    />
  );
}
