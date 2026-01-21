import Auth, { ViewType } from './auth'
import Logo from './logo'
import { validateEmail } from '@/app/actions/validate-email'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { SupabaseClient } from '@supabase/supabase-js'

export function AuthDialog({
  open,
  setOpen,
  supabase,
  view,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  supabase: SupabaseClient
  view: ViewType
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <VisuallyHidden>
          <DialogTitle>Sign in to VibeFrame</DialogTitle>
          <DialogDescription>
            Sign in or create an account to access VibeFrame
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex justify-center items-center flex-col">
          <h1 className="flex flex-col items-center gap-2 text-xl font-bold mb-6 w-full">
            <Logo />
            Sign in
          </h1>
          <div className="w-full">
            <Auth
              supabaseClient={supabase}
              view={view}
              providers={['google']}
              socialLayout="horizontal"
              onSignUpValidate={validateEmail}
              metadata={{
                is_fragments_user: true,
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
