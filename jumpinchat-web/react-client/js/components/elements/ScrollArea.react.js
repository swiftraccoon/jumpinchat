import React, { createContext, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import classnames from 'classnames';

export const ScrollAreaContext = createContext({ scrollBottom: () => {} });

const ScrollArea = forwardRef(({
  children, className, contentClassName, contentStyle, style,
  horizontal = true, vertical = true, onScroll, ...props
}, ref) => {
  const container = useRef(null);
  const scrollArea = useMemo(() => ({
    scrollBottom: () => {
      if (container.current) container.current.scrollTop = container.current.scrollHeight;
    },
    scrollTop: () => { if (container.current) container.current.scrollTop = 0; },
    scrollYTo: (top) => { if (container.current) container.current.scrollTop = top; },
  }), []);
  useImperativeHandle(ref, () => scrollArea, [scrollArea]);
  return (
    <ScrollAreaContext.Provider value={scrollArea}>
      <div
        {...props}
        ref={container}
        className={classnames('scroll-area', className)}
        style={{ overflowX: horizontal ? 'auto' : 'hidden', overflowY: vertical ? 'auto' : 'hidden', ...style }}
        onScroll={(event) => {
          const node = event.currentTarget;
          onScroll?.({
            topPosition: node.scrollTop, leftPosition: node.scrollLeft,
            containerHeight: node.clientHeight, containerWidth: node.clientWidth,
            realHeight: node.scrollHeight, realWidth: node.scrollWidth,
          });
        }}
      >
        <div className={classnames('scrollarea-content', contentClassName)} style={contentStyle}>
          {children}
        </div>
      </div>
    </ScrollAreaContext.Provider>
  );
});

export default ScrollArea;
