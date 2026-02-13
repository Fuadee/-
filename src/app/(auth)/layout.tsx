export default function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 20% 10%, rgba(148, 163, 184, 0.25) 0%, rgba(241, 245, 249, 0.6) 35%, #e2e8f0 100%)"
      }}
    >
      {children}
    </main>
  );
}
