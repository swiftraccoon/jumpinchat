import React, { useEffect, useRef, Fragment } from 'react';
import PropTypes from 'prop-types';
import classNames from '../../../utils/classNames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import FloatingLayer from '../../elements/FloatingLayer.react';
import ScrollArea from '../../elements/ScrollArea.react';

const IconPicker = ({
  onOpen,
  onClose,
  onChange,
  isOpen,
  value = null,
  icons,
}) => {
  const node = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const outside = (event) => {
      if (!node.current?.contains(event.target) && !trigger.current?.contains(event.target)) onClose();
    };
    const escape = (event) => {
      if (event.key === 'Escape') { onClose(); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [isOpen, onClose]);

  return (
    <FloatingLayer
      attachment="top center"
      constraints={[
        {
          to: 'window',
          attachment: 'together',
          pin: true,
        },
      ]}
    >
      <button
        type="button"
        ref={trigger}
        aria-label="Choose role icon"
        aria-expanded={isOpen}
        onClick={isOpen ? onClose : onOpen}
        className={classNames(
          'button',
          'button--clear',
          'roles__IconPickerAction',
        )}
      >
        <FontAwesomeIcon icon={['fas', value]} />
      </button>
      {isOpen && (
        <ScrollArea
          className="roles__IconPicker"
          horizontal={false}
        >
          <div className="roles__IconPickerWrapper" ref={node}>
            {icons.map(icon => (
              <button
                key={icon}
                type="button"
                onClick={() => onChange(icon)}
                className={classNames('button', 'button--clear', 'roles__IconPickerItem', {
                  'roles__IconPickerItem--selected': icon === value,
                })}
              >
                <FontAwesomeIcon icon={['fas', icon]} />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </FloatingLayer>
  );
};

IconPicker.propTypes = {
  onOpen: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  value: PropTypes.string,
  icons: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default IconPicker;
