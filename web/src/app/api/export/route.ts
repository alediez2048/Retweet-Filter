import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', user.id)

  // Simple CSV export
  const csv = [
    'Platform,Handle,Text,Captured At,URL',
    ...(posts || []).map(p => 
      `${p.platform},"${p.user_handle}","${p.text}",${p.captured_at},"${p.source_url}"`
    )
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="posts-export.csv"'
    }
  })
}
