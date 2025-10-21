import * as React from "react"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border bg-white shadow-sm ${className}`}
      {...props}
    />
  )
}

function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col space-y-1.5 p-6 ${className}`}
      {...props}
    />
  )
}

function CardTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-2xl font-semibold leading-none tracking-tight ${className}`}
      {...props}
    />
  )
}

function CardDescription({ className = "", ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-sm text-gray-500 ${className}`}
      {...props}
    />
  )
}

function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-6 pt-0 ${className}`} {...props} />
}

function CardFooter({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center p-6 pt-0 ${className}`}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
