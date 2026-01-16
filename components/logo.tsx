export default function Logo({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`font-bold ${className || ''}`} {...props}>
      WireFrame AI
    </span>
  )
}
