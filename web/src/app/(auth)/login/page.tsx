'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const supabase = createClient()

  const handleMagicLink = async () => {
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`
      }
    })
    alert('Check your email for magic link!')
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <h1 className="text-3xl font-bold">Sign In</h1>
        
        {/* Magic Link */}
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full px-4 py-2 border rounded"
          />
          <button onClick={handleMagicLink} className="w-full mt-2 bg-blue-600 text-white py-2 rounded">
            Send Magic Link
          </button>
        </div>

        <div className="text-center">OR</div>

        {/* OAuth */}
        <button onClick={handleGoogleLogin} className="w-full bg-white border py-2 rounded">
          Continue with Google
        </button>
      </div>
    </div>
  )
}
