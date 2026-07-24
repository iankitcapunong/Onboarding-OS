export function CreditsLockedPage({ feature }: { feature: string }) {
  return (
    <div className="credits-locked">
      <h2>You&apos;re out of credits</h2>
      <p>
        {feature} is locked until your credits reset next month. Need more before then?{" "}
        <a href="mailto:bryansumait.automate@gmail.com">Get in touch</a> about upgrading your plan.
      </p>
      <a className="btn btn-primary" href="mailto:bryansumait.automate@gmail.com">
        Upgrade / contact us
      </a>
    </div>
  );
}
