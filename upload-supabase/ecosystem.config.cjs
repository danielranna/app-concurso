/** PM2: na VPS rode `pm2 start ecosystem.config.cjs` */
module.exports = {
  apps: [
    {
      name: "upload-supabase",
      script: "src/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
