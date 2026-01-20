import Image from 'next/image'

export default function Logo({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`relative ${className || ''}`} {...props}>
      <Image
        src="/vibeframe-logo.png"
        alt="VibeFrame"
        width={180}
        height={40}
        className="h-full w-auto object-contain dark:invert"
        priority
      />
    </div>
  )
}
