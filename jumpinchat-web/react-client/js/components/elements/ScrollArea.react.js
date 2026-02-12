import React from 'react';
import PropTypes from 'prop-types';
import _ReactScrollBar from 'react-scrollbar';
const ReactScrollBar = _ReactScrollBar.default || _ReactScrollBar;
import classnames from 'classnames';

const ScrollArea = React.forwardRef(({
  children,
  className = null,
  ...props
}, ref) => (
  <ReactScrollBar
    className={classnames('scroll-area', className)}
    stopScrollPropagation
    ref={ref}
    {...props}
  >
    {children}
  </ReactScrollBar>
));

ScrollArea.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default ScrollArea;
