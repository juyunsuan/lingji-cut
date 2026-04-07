export function UserMessage({ content }: { content: string }) {
  return (
    <div className="self-end bg-mac-blue text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-[13px] leading-normal max-w-[85%] whitespace-pre-wrap break-words">
      {content}
    </div>
  );
}
