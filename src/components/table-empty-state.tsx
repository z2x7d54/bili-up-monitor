import { TableCell } from "@/components/ui/table";

type TableEmptyStateProps = {
  colSpan: number;
  children: React.ReactNode;
};

export function TableEmptyState({ colSpan, children }: TableEmptyStateProps) {
  return (
    <TableCell colSpan={colSpan} className="h-32 p-0 text-slate-500">
      <div className="sticky left-0 flex w-[calc(100vw-2rem)] max-w-full items-center justify-center px-6 text-center lg:w-[calc(100vw-260px-5rem)]">
        {children}
      </div>
    </TableCell>
  );
}
