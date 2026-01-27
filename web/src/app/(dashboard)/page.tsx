import { getUserStats, getPosts } from '@/lib/db'
import { PLATFORM_CONFIG } from '@/lib/shared/categories'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  const stats = await getUserStats()
  const { data: posts } = await getPosts({ limit: 20 })

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Your Content Archive</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {Object.entries(stats.by_platform || {}).map(([platform, count]) => {
          const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]
          if (!config) return null
          return (
            <div key={platform} className="bg-white rounded-lg p-6 shadow">
              <div className="text-3xl mb-2">{config.icon}</div>
              <div className="text-2xl font-bold">{count as number}</div>
              <div className="text-gray-600">{config.label}</div>
            </div>
          )
        })}
      </div>

      {/* Recent Posts */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Recent</h2>
        <div className="space-y-4">
          {posts?.map(post => {
            const config = PLATFORM_CONFIG[post.platform as keyof typeof PLATFORM_CONFIG]
            if (!config) return null
            return (
              <div key={post.id} className="bg-white rounded-lg p-4 shadow">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">
                    {config.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{post.user_name}</div>
                    <div className="text-gray-600">@{post.user_handle}</div>
                    <div className="mt-2">{post.text}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
