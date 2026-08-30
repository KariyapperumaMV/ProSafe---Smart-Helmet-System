export function GlassCard({ children, className = "", style, ...rest }) {
  return (
    <div className={`ps-card ${className}`} style={style} {...rest}>
      {children}
    </div>
  );
}
