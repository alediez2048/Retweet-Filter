import { getUserStats } from '@/lib/db'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  const stats = await getUserStats()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Analytics</h1>
      
      {/* Simple stats display - add charts later */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4">Total Posts</h2>
          <div className="text-4xl font-bold">{stats.total || 0}</div>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4">Today</h2>
          <div className="text-4xl font-bold">{stats.today || 0}</div>
        </div>
      </div>

      {/* Platform breakdown */}
      <div className="mt-8 bg-white rounded-lg p-6 shadow">
        <h2 className="text-xl font-semibold mb-4">By Platform</h2>
        {Object.entries(stats.by_platform || {}).map(([platform, count]) => (
          <div key={platform} className="flex justify-between py-2">
            <span className="capitalize">{platform}</span>
            <span className="font-semibold">{count as number}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
