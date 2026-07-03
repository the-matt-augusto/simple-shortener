import ShortenForm from "@/components/ShortenForm";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-950 to-gray-900 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-center text-3xl font-bold tracking-tight text-white">
          Encurtador de URL
        </h1>
        <p className="mt-2 mb-6 text-center text-sm text-gray-400">
          Cole um link longo e receba uma versão curta na hora.
        </p>
        <ShortenForm />
      </div>
    </main>
  );
}