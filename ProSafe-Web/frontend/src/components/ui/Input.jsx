export function Field({ label, htmlFor, error, help, children, required }) {
  return (
    <div className="ps-field">
      {label && (
        <label className="ps-label" htmlFor={htmlFor}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="ps-error-text" role="alert">
          {error}
        </span>
      ) : (
        help && <span className="ps-help-text">{help}</span>
      )}
    </div>
  );
}

export function Input({ error, className = "", ...rest }) {
  return <input className={`ps-input ${error ? "has-error" : ""} ${className}`} {...rest} />;
}

export function Textarea({ error, className = "", ...rest }) {
  return <textarea className={`ps-textarea ${error ? "has-error" : ""} ${className}`} {...rest} />;
}

export function Select({ error, className = "", children, ...rest }) {
  return (
    <select className={`ps-select ${error ? "has-error" : ""} ${className}`} {...rest}>
      {children}
    </select>
  );
}
