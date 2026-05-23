// A red circle with a white "!" — urgent Must-Know map signage.
// Purely visual. Does NOT open anything.
export default function SignBadge() {
  return (
    <div className="sign-badge" title="Urgent Must-Know item" aria-label="Urgent item">
      <span className="sign-badge-mark">!</span>
    </div>
  )
}
