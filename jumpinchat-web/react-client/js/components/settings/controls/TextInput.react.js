import React, { useId } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

const TextInput = React.forwardRef(({
  className = '',
  label,
  subTitle = null,
  value,
  defaultValue,
  onSubmit = null,
  onChange = () => {},
  changed = false,
  error = null,
  success = false,
  buttonLabel,
  id,
}, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
  <div className={classNames('settings__TextInputGroup', className)}>
    <div className="settings__TextInputLabelWrapper">
      <label
        className="settings__Title settings__TextInputLabel"
        htmlFor={inputId}
      >
        {label}
      </label>
      {subTitle && (
        <span className="text-sub">{subTitle}</span>
      )}
    </div>
    <div className="settings__TextInputWrapper">
      <input
        id={inputId}
        className={classNames('input form__Input', 'settings__TextInput', {
          'settings__TextInput--button': Boolean(onSubmit),
        })}
        type="text"
        {...(value !== undefined && value !== null ? { value } : { defaultValue: defaultValue ?? '' })}
        ref={ref}
        onChange={onChange}
      />
      {onSubmit && (
        <button
          className={classNames('button', 'button--floating', {
            'button--highlight': changed,
            'button-green': success,
            'button-blue': !success,
          })}
          type="submit"
          onClick={onSubmit}
        >
          {!!buttonLabel && buttonLabel}
          {!buttonLabel && !success && 'Save'}
          {success && 'Saved'}
        </button>
      )}
    </div>
    {error && (
      <span className="text-red settings__TextInputError">{error}</span>
    )}
  </div>
  );
});

TextInput.propTypes = {
  className: PropTypes.string,
  onSubmit: PropTypes.func,
  onChange: PropTypes.func,
  label: PropTypes.string.isRequired,
  subTitle: PropTypes.string,
  value: PropTypes.string,
  defaultValue: PropTypes.string,
  changed: PropTypes.bool,
  error: PropTypes.string,
  success: PropTypes.bool,
  id: PropTypes.string,
};

export default TextInput;
