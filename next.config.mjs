/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // @supabase/supabase-js lê process.version (sempre atrás de
    // `typeof process !== 'undefined'`) só para compor o header de
    // telemetria X-Client-Info — inofensivo em runtime. O analisador
    // estático do Edge Runtime do Next sinaliza qualquer menção textual a
    // process.version mesmo assim; suprime só esse aviso específico, sem
    // esconder outros warnings de build.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /node_modules\/@supabase\/supabase-js/,
        message: /A Node\.js API is used \(process\.version/,
      },
    ];
    return config;
  },
};

export default nextConfig;
