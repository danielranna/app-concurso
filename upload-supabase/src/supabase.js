import { createClient } from "@supabase/supabase-js"

let serviceClient = null
let anonClient = null

export function getServiceClient(config) {
  if (!serviceClient) {
    serviceClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return serviceClient
}

export function getAnonClient(config) {
  if (!anonClient) {
    anonClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return anonClient
}
