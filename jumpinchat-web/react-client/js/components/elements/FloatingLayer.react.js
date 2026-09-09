import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  autoUpdate, flip, FloatingPortal, shift, useFloating, useMergeRefs,
} from '@floating-ui/react';

const FloatingTargetContext = createContext(null);

// The target is excluded so its toggle can close an already open menu.
export function useOutsideDismiss(ref, onDismiss) {
  const target = useContext(FloatingTargetContext);
  const callback = useRef(onDismiss);
  callback.current = onDismiss;
  useEffect(() => {
    const outside = (event) => {
      const path = event.composedPath?.() || [];
      if (!ref.current || ref.current.contains(event.target) || path.includes(ref.current)
        || target?.contains(event.target) || path.includes(target)) return;
      callback.current?.(event);
    };
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      callback.current?.(event);
      target?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [ref, target]);
}

export function getPlacement(attachment = 'top center', targetAttachment) {
  const [vertical, horizontal = 'center'] = attachment.split(' ');
  const targetVertical = targetAttachment?.split(' ')[0];
  const side = vertical === 'middle'
    ? (horizontal === 'left' ? 'right' : 'left')
    : (targetVertical === 'top' || vertical === 'bottom' ? 'top' : 'bottom');
  const alignment = horizontal === 'left' ? '-start' : horizontal === 'right' ? '-end' : '';
  return `${side}${vertical === 'middle' ? '' : alignment}`;
}

export default function FloatingLayer({ children, attachment, targetAttachment }) {
  const [target, content] = React.Children.toArray(children);
  const { refs, elements, floatingStyles } = useFloating({
    open: !!content,
    placement: getPlacement(attachment, targetAttachment),
    strategy: 'fixed',
    middleware: [flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const referenceRef = useMergeRefs([refs.setReference, target?.props.ref]);
  if (!React.isValidElement(target)) return null;
  return (
    <>
      {React.cloneElement(target, { ref: referenceRef })}
      {content && (
        <FloatingPortal>
          <div ref={refs.setFloating} className="floating-layer" style={floatingStyles}>
            <FloatingTargetContext.Provider value={elements.reference}>
              {content}
            </FloatingTargetContext.Provider>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
