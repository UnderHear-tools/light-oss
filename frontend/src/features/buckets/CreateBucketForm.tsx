import { FormEvent, useState } from "react";

export function CreateBucketForm({
  onSubmit,
  pending,
}: {
  onSubmit: (name: string) => Promise<void>;
  pending: boolean;
}) {
  const [name, setName] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    await onSubmit(name.trim());
    setName("");
  }

  return (
    <form className="panel form-grid" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="bucket-name">Bucket Name</label>
        <input
          id="bucket-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="example-bucket"
          disabled={pending}
        />
      </div>
      <button
        className="button"
        disabled={pending || !name.trim()}
        type="submit"
      >
        {pending ? "Creating..." : "Create Bucket"}
      </button>
    </form>
  );
}
