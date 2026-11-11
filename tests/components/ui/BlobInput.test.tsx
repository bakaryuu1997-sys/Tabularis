import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { BlobInput } from "../../../src/components/ui/BlobInput";

// The shared setup mocks only some icons; this component also needs the file and loader icons.
vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));

const SMALL_TEXT_BLOB = "BLOB:5:text/plain:aGVsbG8="; // "hello", fully loaded
const TRUNCATED_BLOB = "BLOB:100000:text/plain:aGVsbG8="; // preview of a larger value

describe("BlobInput file access", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("asks the backend to show the file dialog and stores the returned reference", async () => {
    const onChange = vi.fn();
    vi.mocked(invoke).mockResolvedValueOnce("BLOB_FILE_REF:3:image/png:/tmp/a.png");

    render(<BlobInput value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("BLOB_FILE_REF:3:image/png:/tmp/a.png"),
    );
    // No path argument: the page never names the file that gets read.
    expect(invoke).toHaveBeenCalledWith("pick_blob_file");
  });

  it("leaves the value alone when the dialog is cancelled", async () => {
    const onChange = vi.fn();
    vi.mocked(invoke).mockResolvedValueOnce(null);

    render(<BlobInput value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the backend's error message", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("File size exceeds maximum allowed size");

    render(<BlobInput value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("File size exceeds maximum allowed size")).toBeInTheDocument();
  });

  it("downloads a fully loaded value through the backend's save dialog", async () => {
    render(<BlobInput value={SMALL_TEXT_BLOB} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle("blobInput.download"));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [cmd, args] = vi.mocked(invoke).mock.calls[0];
    expect(cmd).toBe("save_binary_file_with_dialog");
    expect(args).toEqual({
      defaultFileName: "download.txt",
      filterName: "BLOB",
      extensions: ["txt"],
      base64Data: "aGVsbG8=",
    });
    expect(args).not.toHaveProperty("path");
    expect(args).not.toHaveProperty("filePath");
  });

  it("downloads a truncated value from the database without sending a destination path", async () => {
    render(
      <BlobInput
        value={TRUNCATED_BLOB}
        onChange={vi.fn()}
        connectionId="conn-1"
        tableName="files"
        colName="data"
        pkMap={{ id: 1 }}
        schema="public"
      />,
    );
    fireEvent.click(screen.getByTitle("blobInput.download"));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [cmd, args] = vi.mocked(invoke).mock.calls[0];
    expect(cmd).toBe("save_blob_with_dialog");
    expect(args).toEqual({
      connectionId: "conn-1",
      table: "files",
      colName: "data",
      pkMap: { id: 1 },
      defaultFileName: "download.txt",
      filterName: "BLOB",
      extensions: ["txt"],
      schema: "public",
    });
    expect(args).not.toHaveProperty("filePath");
  });
});
