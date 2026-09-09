import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { useMergeRefs } from '@floating-ui/react';
import FloatingLayer from './FloatingLayer.react';

const Tooltip = forwardRef(({ children, text, position = 'top' }, ref) => {
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);
  const id = useId();
  const targetRef = useMergeRefs([ref, children.props.ref]);
  const hide = () => {
    clearTimeout(timer.current);
    setVisible(false);
  };
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), 250);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const positions = {
    top: ['bottom center', 'top center'],
    bottom: ['top center', 'bottom center'],
    left: ['middle right', 'middle left'],
    right: ['middle left', 'middle right'],
  };
  const [attachment, targetAttachment] = positions[position.split(' ')[0]] || positions.top;
  return (
    <FloatingLayer attachment={attachment} targetAttachment={targetAttachment}>
      {React.cloneElement(children, {
        ref: targetRef,
        'aria-describedby': visible ? id : children.props['aria-describedby'],
        onMouseEnter: (event) => { children.props.onMouseEnter?.(event); show(); },
        onMouseLeave: (event) => { children.props.onMouseLeave?.(event); hide(); },
        onFocus: (event) => { children.props.onFocus?.(event); show(); },
        onBlur: (event) => { children.props.onBlur?.(event); hide(); },
        onKeyDown: (event) => {
          children.props.onKeyDown?.(event);
          if (event.key === 'Escape') hide();
        },
      })}
      {visible && <div className="tooltip__Content" role="tooltip" id={id}>{text}</div>}
    </FloatingLayer>
  );
});

export default Tooltip;
