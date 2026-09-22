# -*- coding: utf-8 -*-
"""Generate realistic workspace input files for the four construction-skill test questions.

Outputs under construction-tests/: 01-造价, 02-质量, 03-安全, 04-进度.
Formats match what the construction file tools read: .xlsx, .docx, .pdf (plus one .png trap).
"""
import os
import random

import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
import xlsxwriter
import docx
from docx.shared import Pt
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
from matplotlib.backends.backend_pdf import PdfPages
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)))
CJK = r"C:\Windows\Fonts\simhei.ttf"
fp_title = FontProperties(fname=CJK, size=16)
fp_head = FontProperties(fname=CJK, size=11)
fp_body = FontProperties(fname=CJK, size=10)

HDR_FILL = PatternFill("solid", fgColor="D9E1F2")
HDR_FONT = Font(bold=True)


def outdir(name):
    d = os.path.join(ROOT, name)
    os.makedirs(d, exist_ok=True)
    return d


def style_header(ws, row=1):
    for c in ws[row]:
        if c.value is not None:
            c.font = HDR_FONT
            c.fill = HDR_FILL
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def autowidth(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def text_pdf(path, title, sections):
    """Render a multi-section Chinese text PDF with a real (extractable) text layer."""
    with PdfPages(path) as pdf:
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.patch.set_facecolor("white")
        y = 0.95
        fig.text(0.5, y, title, fontproperties=fp_title, ha="center")
        y -= 0.055
        for heading, lines in sections:
            if heading:
                fig.text(0.08, y, heading, fontproperties=fp_head)
                y -= 0.032
                fig.lines.append(plt.Line2D([0.08, 0.92], [y + 0.008, y + 0.008], color="black", lw=0.8, transform=fig.transFigure))
            for ln in lines:
                fig.text(0.10, y, ln, fontproperties=fp_body)
                y -= 0.026
            y -= 0.014
        pdf.savefig(fig)
        plt.close(fig)


# ---------------------------------------------------------------- 01 造价
def gen_cost():
    d = outdir("01-造价")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "分部分项清单"
    header = ["序号", "项目编码", "项目名称", "项目特征", "计量单位", "工程量",
              "人工费(元/单位)", "材料费(元/单位)", "机械费(元/单位)", "备注"]
    ws.append(header)
    rows = [
        [1, "010503001001", "矩形柱", "商品混凝土 C30，柱截面≤0.5㎡，泵送", "m³", 12.5, 320, 410, 35, ""],
        [2, "010503002001", "异形梁", "商品混凝土 C30，梁底标高3.6m", "m³", 8.4, 365, 415, 38, ""],
        [3, "010504001001", "直形墙", "商品混凝土 C35，墙厚300mm", "m³", 22.6, 298, 428, 36, ""],
        [4, "010505001001", "有梁板", "商品混凝土 C30，板厚120mm", "m³", 35.8, 276, 402, 33, ""],
        [5, "010515001001", "现浇构件钢筋", "HRB400，直径≤25mm，综合", "t", 3.2, 850, None, 60, "钢筋主材价暂缺，询价中"],
        [6, "010515001002", "现浇构件钢筋", "HPB300，直径≤10mm，综合", "t", 1.5, 920, 4380, 65, ""],
        [7, "011201001001", "墙面一般抹灰", "20mm厚1:2.5水泥砂浆，内墙", "㎡", 86, 28, 15, 0, ""],
        [8, "011201001002", "柱面一般抹灰", "20mm厚1:2.5水泥砂浆", "㎡", 24.5, 34, 16, 0, ""],
        [9, "010802003001", "钢筋网片", "CRB550冷轧带肋，φ6@150", "t", 0.85, 780, 4520, 58, ""],
        [10, "011702001001", "矩形柱模板", "复合木模，支撑高度3.6m内", "㎡", 96, 32, 24, 3, ""],
    ]
    for r in rows:
        ws.append(r)
    for row in ws.iter_rows(min_row=2, max_row=11, min_col=2, max_col=2):
        for c in row:
            c.number_format = "@"
    style_header(ws)
    autowidth(ws, {"A": 6, "B": 16, "C": 14, "D": 34, "E": 9, "F": 9, "G": 13, "H": 13, "I": 13, "J": 22})

    ws2 = wb.create_sheet("费用规则")
    ws2.append(["费用名称", "计算基数", "费率", "说明"])
    for r in [
        ["管理费", "人工费+机械费", "12%", "按各清单项逐项计取"],
        ["利润", "人工费+机械费", "8%", "按各清单项逐项计取"],
        ["增值税", "税前造价合计", "9%", "一般计税，税前造价=分部分项含管理费利润合计"],
        ["", "", "", "本表费率为本次投标口径，优先于其他文件"],
    ]:
        ws2.append(r)
    style_header(ws2)
    autowidth(ws2, {"A": 12, "B": 18, "C": 8, "D": 46})
    wb.save(os.path.join(d, "清单与单价表.xlsx"))

    # Baseline tender workbook: formulas with a deliberately STALE cached value
    # (row 1 quantity was edited 10.0 -> 12.5 after the last recalculation).
    wbk = xlsxwriter.Workbook(os.path.join(d, "基期报价.xlsx"))
    sh = wbk.add_worksheet("基期报价")
    money = wbk.add_format({"num_format": "#,##0.00"})
    txt = wbk.add_format({"num_format": "@"})
    head = ["序号", "项目编码", "项目名称", "单位", "工程量", "基期综合单价(元)", "合价(元)"]
    for i, h in enumerate(head):
        sh.write(0, i, h)
    base_prices = [780, 905, 815, 760, 5200, 5560, 52, 58, 5490, 70]
    names = ["矩形柱", "异形梁", "直形墙", "有梁板", "现浇构件钢筋HRB400",
             "现浇构件钢筋HPB300", "墙面一般抹灰", "柱面一般抹灰", "钢筋网片", "矩形柱模板"]
    units = ["m³", "m³", "m³", "m³", "t", "t", "㎡", "㎡", "t", "㎡"]
    qtys = [12.5, 8.4, 22.6, 35.8, 3.2, 1.5, 86, 24.5, 0.85, 96]
    codes = ["010503001001", "010503002001", "010504001001", "010505001001", "010515001001",
             "010515001002", "011201001001", "011201001002", "010802003001", "011702001001"]
    for i in range(10):
        r = i + 1
        sh.write_number(r, 0, i + 1)
        sh.write_string(r, 1, codes[i], txt)
        sh.write_string(r, 2, names[i])
        sh.write_string(r, 3, units[i])
        sh.write_number(r, 4, qtys[i])
        sh.write_number(r, 5, base_prices[i], money)
        stale = 7800.00 if i == 0 else round(qtys[i] * base_prices[i], 2)  # stale cache: 780*10.0
        sh.write_formula(r, 6, f"=E{r+1}*F{r+1}", money, stale)
    sh.write(11, 2, "合计")
    sh.write_formula(11, 6, "=SUM(G2:G11)", money, 103288.50)  # stale total including the stale row
    sh.set_column("A:A", 6)
    sh.set_column("B:B", 16)
    sh.set_column("C:C", 20)
    sh.set_column("D:D", 8)
    sh.set_column("E:G", 14)
    wbk.close()


# ---------------------------------------------------------------- 02 质量
def gen_quality():
    d = outdir("02-质量")

    text_pdf(
        os.path.join(d, "混凝土试块抗压强度试验报告.pdf"),
        "混凝土试块抗压强度试验报告",
        [
            ("报告信息", [
                "报告编号：JC-HNT-2026-1015",
                "委托单位：宏远建工集团御景湾项目部",
                "工程名称：御景湾3#住宅楼",
                "检测部位：二层结构 1-10/A-D 轴（墙、柱、梁、板）",
                "强度等级：C30    养护条件：标准养护    龄期：28d",
                "成型日期：2026-08-28    试压日期：2026-09-25",
            ]),
            ("试验结果（150mm×150mm×150mm 立方体）", [
                "试块组号      抗压强度(MPa)",
                "  1             33.2",
                "  2             31.8",
                "  3             32.5",
                "  4             28.9",
                "  5             30.6",
                "  6             31.2",
            ]),
            ("原材料登记", [
                "水泥：P·O 42.5 普通硅酸盐水泥，登记编号 C-2026-0781",
                "砂：中砂，细度模数 2.6；石：5-25mm 连续级配碎石",
            ]),
            ("备注", [
                "1. 本报告仅对来样负责；2. 单组强度值见上表，评定由委托方按规范进行。",
                "批准：略    审核：略    试验：略",
            ]),
        ],
    )

    text_pdf(
        os.path.join(d, "钢筋原材力学性能试验报告.pdf"),
        "钢筋原材力学性能试验报告",
        [
            ("报告信息", [
                "报告编号：JC-GJ-2026-0873",
                "委托单位：宏远建工集团御景湾项目部",
                "工程名称：御景湾3#住宅楼",
                "样品名称：热轧带肋钢筋 HRB400，公称直径 20mm",
                "代表批量：60t    取样日期：2026-08-20",
            ]),
            ("试验结果", [
                "项目              试样1     试样2     技术要求",
                "下屈服强度(MPa)    445       452       ≥400",
                "抗拉强度(MPa)      585       592       ≥540",
                "强屈比             1.31      1.31      ≥1.25",
                "断后伸长率(%)      18        19        ≥16",
                "弯曲试验           合格      合格      无裂纹",
            ]),
            ("备注", ["批准：略    审核：略    试验：略"]),
        ],
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "保护层扫描记录"
    ws.append(["测点编号", "构件部位", "设计保护层(mm)", "实测值(mm)", "偏差(mm)"])
    data = [
        ("L-1", "二层梁 3轴", 25, 29, 4), ("L-2", "二层梁 5轴", 25, 31, 6),
        ("L-3", "二层梁 7轴", 25, 23, -2), ("L-4", "二层梁 9轴", 25, 34, 9),
        ("B-1", "二层板 1-2/A", 25, 28, 3), ("B-2", "二层板 3-4/B", 25, 26, 1),
        ("B-3", "二层板 5-6/C", 25, 21, -4), ("B-4", "二层板 7-8/D", 25, 30, 5),
        ("Z-1", "二层柱 3/B", 25, 27, 2), ("Z-2", "二层柱 5/C", 25, 19, -6),
        ("Z-3", "二层柱 7/B", 25, 32, 7), ("Z-4", "二层柱 9/D", 25, 25, 0),
    ]
    for r in data:
        ws.append(list(r))
    ws.append([])
    ws.append(["扫描日期", "2026-09-18", "", "仪器编号", "TC-110-042"])
    style_header(ws)
    autowidth(ws, {"A": 10, "B": 16, "C": 15, "D": 12, "E": 10})
    wb.save(os.path.join(d, "钢筋保护层扫描记录.xlsx"))

    doc = docx.Document()
    doc.add_heading("水泥出厂合格证", level=1)
    for p in [
        "产品名称：普通硅酸盐水泥 P·O 42.5",
        "生产单位：青峰水泥有限公司",
        "出厂编号：C-2026-0718",
        "出厂日期：2026-07-18",
        "执行标准：GB 175-2007",
    ]:
        doc.add_paragraph(p)
    t = doc.add_table(rows=5, cols=2)
    t.style = "Table Grid"
    for i, (k, v) in enumerate([
        ("安定性（沸煮法）", "合格"),
        ("3d 抗压强度", "26.5 MPa"),
        ("28d 抗压强度", "48.2 MPa"),
        ("3d 抗折强度", "5.8 MPa"),
        ("28d 抗折强度", "7.6 MPa"),
    ]):
        t.rows[i].cells[0].text = k
        t.rows[i].cells[1].text = v
    doc.add_paragraph("本批水泥经检验合格，准予出厂。质检专用章（略）")
    doc.save(os.path.join(d, "水泥出厂合格证.docx"))


# ---------------------------------------------------------------- 03 安全
def gen_safety():
    d = outdir("03-安全")

    doc = docx.Document()
    doc.add_heading("高大模板支撑体系专项施工方案（节选）", level=1)
    doc.add_heading("一、工程概况", level=2)
    doc.add_paragraph(
        "地下室一区顶板，板厚600mm，层高4.2m，混凝土浇筑方量约410m³。"
        "模板支撑体系采用φ48×3.0扣件式钢管满堂支架，属超过一定规模的危险性较大的分部分项工程。"
    )
    doc.add_heading("二、支撑体系主要参数", level=2)
    for p in [
        "1. 立杆纵横向间距 900mm×900mm；",
        "2. 水平杆步距 1500mm；",
        "3. 扫地杆距地高度不大于200mm，纵横向连续设置；",
        "4. 竖向剪刀撑连续设置，水平剪刀撑每隔不大于6m设置一道；",
        "5. 顶部可调托撑悬臂长度严禁超过300mm；",
        "6. 立杆基础设置50mm厚通长木垫板。",
    ]:
        doc.add_paragraph(p)
    doc.add_heading("三、混凝土浇筑要求", level=2)
    for p in [
        "1. 浇筑顺序：由中间向两侧对称浇筑，不得集中堆载；",
        "2. 分层浇筑，每层厚度不大于400mm；",
        "3. 浇筑期间设专人监测立杆沉降与水平位移，发现异常立即停止浇筑。",
    ]:
        doc.add_paragraph(p)
    doc.add_heading("四、验收与监测", level=2)
    doc.add_paragraph("浇筑前由项目技术负责人组织专项验收，验收合格并形成记录后方可浇筑。")
    doc.save(os.path.join(d, "高大模板支撑体系专项施工方案（节选）.docx"))

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "现场检查记录"
    ws.append(["序号", "检查项目", "方案要求", "现场实际情况", "检查结论"])
    rows = [
        [1, "立杆纵横向间距", "900×900mm", "3-4轴交B轴、5-6轴交C轴两处实测1200×900mm", "不符合"],
        [2, "扫地杆设置", "距地≤200mm，纵横连续", "3-4轴交B轴处横向扫地杆缺失1根", "不符合"],
        [3, "水平杆步距", "1500mm", "抽检6处，实测1450~1520mm", "符合"],
        [4, "竖向剪刀撑", "连续设置", "全数检查，连续设置到位", "符合"],
        [5, "可调托撑悬臂长度", "≤300mm", "抽检5处，其中2处实测450mm", "不符合"],
        [6, "临边防护", "栏杆+挡脚板齐全", "一区周边临边防护已按方案设置", "符合"],
        [7, "立杆基础垫板", "50mm厚通长垫板", "垫板已通长铺设", "符合"],
    ]
    for r in rows:
        ws.append(r)
    ws.append([])
    ws.append(["检查人", "王建国", "检查日期", "2026-09-21", ""])
    style_header(ws)
    autowidth(ws, {"A": 6, "B": 18, "C": 22, "D": 42, "E": 10})
    wb.save(os.path.join(d, "高支模现场检查记录.xlsx"))

    # Scanned-style handover record: raster PNG with text baked in, then an
    # image-only PDF (no text layer) to simulate an unreadable scan.
    random.seed(42)
    W, H = 1654, 2339
    img = Image.new("RGB", (W, H), "white")
    dr = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(CJK, 72)
    f_body = ImageFont.truetype(CJK, 44)
    dr.text((W // 2, 140), "混凝土浇筑顺序交底记录", font=f_title, fill="black", anchor="mm")
    lines = [
        "交底部位：地下室一区顶板",
        "交底日期：2026年9月20日",
        "",
        "1. 浇筑顺序：由中间向两侧对称推进；",
        "2. 分层厚度不大于400mm，严禁集中堆载；",
        "3. 浇筑期间安排专人监测支架沉降与位移；",
        "4. 发现异常响声或位移超限立即撤离并上报。",
        "",
        "交底人：李工        被交底班组：混凝土一组",
    ]
    y = 320
    for ln in lines:
        dr.text((160, y), ln, font=f_body, fill="black")
        y += 96
    img = img.rotate(1.3, resample=Image.BICUBIC, fillcolor="white")
    dr = ImageDraw.Draw(img)
    for _ in range(350):
        x, y = random.randrange(W), random.randrange(H)
        dr.point((x, y), fill=(90, 90, 90))
    scan_png = os.path.join(d, "浇筑交底扫描页.png")
    img.save(scan_png)
    fig = plt.figure(figsize=(8.27, 11.69), dpi=200)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(img)
    ax.axis("off")
    fig.savefig(os.path.join(d, "混凝土浇筑顺序交底记录（扫描件）.pdf"), format="pdf")
    plt.close(fig)


# ---------------------------------------------------------------- 04 进度
def gen_schedule():
    d = outdir("04-进度")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "任务表"
    ws.append(["任务ID", "任务名称", "工期(工作日)", "紧前任务", "搭接关系", "时距(工作日)",
               "锁定开始", "锁定完成", "备注"])
    rows = [
        ["A", "场地平整及临建", 4, "", "", "", "2026-09-21", "2026-09-24", "已完工，按实际日期锁定"],
        ["B", "土方开挖", 5, "A", "FS", 0, "", "", ""],
        ["C", "混凝土垫层", 2, "B", "FS", 1, "", "", "垫层浇筑后需等强1天"],
        ["D", "基础防水及保护层", 3, "C", "FS", 0, "", "", ""],
        ["E", "基础钢筋混凝土", 5, "D", "FS", 0, "", "", ""],
        ["F", "地下室外墙及柱", 6, "E", "FS", 0, "", "", ""],
        ["G", "顶板模板及钢筋混凝土", 7, "F", "FS", 0, "", "", ""],
        ["H", "外墙防水及土方回填", 3, "G", "SS", 2, "", "", "原进度表即按SS+2搭接"],
        ["I", "首层结构施工", 8, "", "", "", "", "", "紧前关系待定"],
        ["J", "地下室移交验收", 0, "G", "FS", 2, "", "", "里程碑"],
    ]
    for r in rows:
        ws.append(r)
    for row in ws.iter_rows(min_row=2, max_row=11, min_col=1, max_col=1):
        for c in row:
            c.number_format = "@"
    style_header(ws)
    autowidth(ws, {"A": 8, "B": 22, "C": 12, "D": 10, "E": 10, "F": 12, "G": 12, "H": 12, "I": 24})

    ws2 = wb.create_sheet("项目日历")
    ws2.append(["项目", "内容"])
    for r in [
        ["计划开工日期", "2026-09-28"],
        ["每周休息日", "星期六、星期日"],
        ["法定节假日", "2026-09-25（中秋节）"],
        ["", "2026-10-01 至 2026-10-07（国庆节，共7天）"],
        ["说明", "工期一律按工作日计算，日期为日历日"],
    ]:
        ws2.append(r)
    style_header(ws2)
    autowidth(ws2, {"A": 14, "B": 40})
    wb.save(os.path.join(d, "进度计划任务表.xlsx"))

    # Hand-drawn Gantt photo trap: dates casually laid out (weekends/holidays ignored).
    W, H = 1800, 1080
    img = Image.new("RGB", (W, H), "white")
    dr = ImageDraw.Draw(img)
    f_t = ImageFont.truetype(CJK, 42)
    f_b = ImageFont.truetype(CJK, 30)
    f_s = ImageFont.truetype(CJK, 24)
    dr.text((W // 2, 50), "地下室进度计划（手排版，仅供参考）", font=f_t, fill="black", anchor="mm")
    tasks = [
        ("A 场地平整", "9/21", "9/24"), ("B 土方开挖", "9/25", "9/29"),
        ("C 垫层", "9/30", "10/2"), ("D 基础防水", "10/3", "10/6"),
        ("E 基础砼", "10/7", "10/13"), ("F 外墙及柱", "10/14", "10/21"),
        ("G 顶板", "10/22", "10/30"), ("H 防水回填", "10/24", "10/27"),
        ("I 首层结构", "11/2", "11/11"), ("J 移交验收", "11/2", "11/2"),
    ]
    left, top, row_h = 320, 130, 78
    x0, x1 = 560, 1680
    day0, dayn = 21, 45  # 9/21 .. 11/4
    def x_of(md):
        m, dd = md.split("/")
        n = (30 - day0 + int(dd)) if m == "10" else (30 - day0 + 31 + int(dd)) if m == "11" else (int(dd) - day0)
        return x0 + (x1 - x0) * n / dayn
    for i, (name, s, e) in enumerate(tasks):
        y = top + i * row_h
        dr.text((left - 20, y + row_h // 2), name, font=f_b, fill="black", anchor="rm")
        dr.line([(left, y), (x1, y)], fill=(180, 180, 180))
        xs, xe = x_of(s), x_of(e)
        dr.rectangle([xs, y + 16, max(xe, xs + 14), y + row_h - 16], fill=(120, 160, 210), outline=(40, 70, 120))
        dr.text((xs + 6, y + 14), s, font=f_s, fill="black")
        dr.text((max(xe, xs + 14) + 6, y + 14), e, font=f_s, fill="black")
    dr.line([(left, top + len(tasks) * row_h), (x1, top + len(tasks) * row_h)], fill=(180, 180, 180))
    dr.text((x0, H - 60), "2026年9月", font=f_s, fill="black")
    dr.text((x0 + 460, H - 60), "2026年10月", font=f_s, fill="black")
    dr.text((x0 + 960, H - 60), "2026年11月", font=f_s, fill="black")
    img.save(os.path.join(d, "手排甘特图.png"))


if __name__ == "__main__":
    gen_cost()
    gen_quality()
    gen_safety()
    gen_schedule()
    for base, _, files in os.walk(ROOT):
        for f in sorted(files):
            p = os.path.join(base, f)
            print(os.path.relpath(p, ROOT).encode("ascii", "replace").decode(), os.path.getsize(p))
