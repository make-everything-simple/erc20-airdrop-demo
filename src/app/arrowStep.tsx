import { ReactElement } from "react";

type ReactText = string | number;
type ReactChild = ReactElement | ReactText;
export type ArrowStepProps = {
  from?: string,
  to?:string 
  children?: ReactChild
};

export function ArrowStep(props: ArrowStepProps) {
  // Render Layout
  const { from, to, children } = props;
  return (
    <div className="text-center mt-4">
      {from && (<p className="rounded-rectangle">{from}</p>)}
      <p>||</p>
      {children}
      <p>\/</p>
      {to && (<p className="rounded-rectangle">{to}</p>)}
    </div>
  );
}