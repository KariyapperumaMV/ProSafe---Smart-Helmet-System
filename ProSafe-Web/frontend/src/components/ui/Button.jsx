export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  iconOnly = false,
  className = "",
  disabled,
  type = "button",
  ...rest
}) {
  const classes = [
    "ps-btn",
    `ps-btn-${variant}`,
    size === "sm" ? "ps-btn-sm" : "",
    iconOnly ? "ps-btn-icon-only" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading ? "…" : children}
    </button>
  );
}
