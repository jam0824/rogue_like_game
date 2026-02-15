import os
import re
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, colorchooser

from PIL import Image


def natural_key(s: str):
    """自然順ソート用キー: 'img2.png' < 'img10.png' になる"""
    base = os.path.basename(s)
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", base)]


def list_png_files(folder: str):
    files = []
    for name in os.listdir(folder):
        path = os.path.join(folder, name)
        if os.path.isfile(path) and name.lower().endswith(".png"):
            files.append(path)
    return files


def hex_to_rgba(hex_color: str, alpha: int = 255):
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r, g, b, alpha)


def concat_pngs_left_to_right(
    folder: str,
    output_path: str,
    padding: int = 0,
    sort_mode: str = "natural",  # "natural" or "lex"
    align: str = "top",          # "top" "center" "bottom"
    transparent_bg: bool = True,
    bg_hex: str = "#FFFFFF",
):
    if not os.path.isdir(folder):
        raise ValueError("フォルダが存在しません。")

    png_paths = list_png_files(folder)
    if not png_paths:
        raise ValueError("フォルダ内にPNGが見つかりません。")

    if sort_mode == "natural":
        png_paths.sort(key=natural_key)
    else:
        png_paths.sort(key=lambda p: os.path.basename(p).lower())

    images = []
    sizes = []
    for p in png_paths:
        with Image.open(p) as im:
            rgba = im.convert("RGBA")
            rgba.load()  # ここで読み切ってファイルハンドルを確実に解放
            images.append(rgba)
            sizes.append(rgba.size)

    widths = [w for (w, h) in sizes]
    heights = [h for (w, h) in sizes]

    total_width = sum(widths) + padding * (len(images) - 1)
    max_height = max(heights)

    if transparent_bg:
        bg = (0, 0, 0, 0)
    else:
        bg = hex_to_rgba(bg_hex, 255)

    canvas = Image.new("RGBA", (total_width, max_height), bg)

    x = 0
    for img in images:
        w, h = img.size
        if align == "top":
            y = 0
        elif align == "center":
            y = (max_height - h) // 2
        else:  # bottom
            y = max_height - h

        # 透過を保ったまま貼り付け（RGBAのalphaがマスクとして使われる）
        canvas.paste(img, (x, y), img)
        x += w + padding

    # 出力はPNG固定（透過を保持するため）
    if not output_path.lower().endswith(".png"):
        output_path += ".png"

    canvas.save(output_path, format="PNG")
    return output_path, len(images), (total_width, max_height)


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PNG 横連結（名前順）")
        self.geometry("720x320")
        self.resizable(False, False)

        self.folder_var = tk.StringVar()
        self.out_var = tk.StringVar()

        self.padding_var = tk.IntVar(value=0)

        self.sort_var = tk.StringVar(value="natural")  # natural / lex
        self.align_var = tk.StringVar(value="top")     # top / center / bottom

        self.transparent_bg_var = tk.BooleanVar(value=True)
        self.bg_color_var = tk.StringVar(value="#FFFFFF")

        self._build_ui()

    def _build_ui(self):
        pad = {"padx": 10, "pady": 6}

        frm = ttk.Frame(self)
        frm.pack(fill="both", expand=True, padx=10, pady=10)

        # Folder
        ttk.Label(frm, text="入力フォルダ（PNGが入っているフォルダ）").grid(row=0, column=0, sticky="w", **pad)
        folder_entry = ttk.Entry(frm, textvariable=self.folder_var, width=70)
        folder_entry.grid(row=1, column=0, sticky="w", **pad)
        ttk.Button(frm, text="参照", command=self.pick_folder).grid(row=1, column=1, sticky="w", **pad)

        # Output
        ttk.Label(frm, text="出力ファイル（PNG）").grid(row=2, column=0, sticky="w", **pad)
        out_entry = ttk.Entry(frm, textvariable=self.out_var, width=70)
        out_entry.grid(row=3, column=0, sticky="w", **pad)
        ttk.Button(frm, text="参照", command=self.pick_output).grid(row=3, column=1, sticky="w", **pad)

        # Options row
        opt = ttk.LabelFrame(frm, text="オプション")
        opt.grid(row=4, column=0, columnspan=2, sticky="we", padx=10, pady=10)

        ttk.Label(opt, text="余白(px)").grid(row=0, column=0, padx=10, pady=6, sticky="w")
        ttk.Spinbox(opt, from_=0, to=500, textvariable=self.padding_var, width=6).grid(row=0, column=1, padx=10, pady=6, sticky="w")

        ttk.Label(opt, text="ソート").grid(row=0, column=2, padx=10, pady=6, sticky="w")
        ttk.Radiobutton(opt, text="自然順", variable=self.sort_var, value="natural").grid(row=0, column=3, padx=4, pady=6, sticky="w")
        ttk.Radiobutton(opt, text="辞書順", variable=self.sort_var, value="lex").grid(row=0, column=4, padx=4, pady=6, sticky="w")

        ttk.Label(opt, text="縦揃え").grid(row=1, column=0, padx=10, pady=6, sticky="w")
        ttk.Combobox(opt, textvariable=self.align_var, values=["top", "center", "bottom"], width=10, state="readonly").grid(
            row=1, column=1, padx=10, pady=6, sticky="w"
        )

        ttk.Checkbutton(opt, text="背景を透過にする", variable=self.transparent_bg_var, command=self.toggle_bg).grid(
            row=1, column=2, padx=10, pady=6, sticky="w", columnspan=2
        )

        self.bg_btn = ttk.Button(opt, text="背景色を選ぶ", command=self.pick_bg_color)
        self.bg_btn.grid(row=1, column=4, padx=10, pady=6, sticky="w")

        self.toggle_bg()

        # Run button
        ttk.Button(frm, text="生成する", command=self.run).grid(row=5, column=0, columnspan=2, pady=10)

        # Hint
        ttk.Label(frm, text="※ フォルダ内の .png をファイル名順に左→右で1列連結します（透過保持）。").grid(
            row=6, column=0, columnspan=2, sticky="w", padx=10, pady=4
        )

    def toggle_bg(self):
        if self.transparent_bg_var.get():
            self.bg_btn.state(["disabled"])
        else:
            self.bg_btn.state(["!disabled"])

    def pick_folder(self):
        d = filedialog.askdirectory()
        if d:
            self.folder_var.set(d)
            # 出力ファイルが未設定ならデフォルトを入れる
            if not self.out_var.get():
                self.out_var.set(os.path.join(d, "combined.png"))

    def pick_output(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[("PNG", "*.png")],
            initialfile="combined.png",
        )
        if path:
            self.out_var.set(path)

    def pick_bg_color(self):
        color = colorchooser.askcolor(title="背景色を選択")
        if color and color[1]:
            self.bg_color_var.set(color[1])

    def run(self):
        folder = self.folder_var.get().strip()
        out = self.out_var.get().strip()

        if not folder:
            messagebox.showerror("エラー", "入力フォルダを指定してください。")
            return
        if not out:
            messagebox.showerror("エラー", "出力ファイルを指定してください。")
            return

        try:
            saved, n, size = concat_pngs_left_to_right(
                folder=folder,
                output_path=out,
                padding=int(self.padding_var.get()),
                sort_mode=self.sort_var.get(),
                align=self.align_var.get(),
                transparent_bg=bool(self.transparent_bg_var.get()),
                bg_hex=self.bg_color_var.get(),
            )
            messagebox.showinfo("完了", f"保存しました:\n{saved}\n\n枚数: {n}\nサイズ: {size[0]} x {size[1]}")
        except Exception as e:
            messagebox.showerror("エラー", str(e))


if __name__ == "__main__":
    App().mainloop()
