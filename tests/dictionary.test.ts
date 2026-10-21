import { describe, expect, it } from "vitest";
import { parseSearchResults, parseViewHeadword } from "../server/services/moe-dictionary.ts";

const revisedSearch = `<table>
<tr data-link='dictView.jsp?ID=156656&q=1&word=%E9%8A%80%E8%A1%8C' role='link'><td>1</td>
	<td><a href="dictView.jsp?ID=156656&amp;q=1&amp;word=%E9%8A%80%E8%A1%8C" ><cR>銀行</cR></a></td>
	<td class=ph> <code>ㄧㄣ<sup>ˊ</sup></code>  <code>ㄏㄤ<sup>ˊ</sup></code></td></tr>
<tr data-link='dictView.jsp?ID=40837&q=1&word=%E9%8A%80%E8%A1%8C' role='link'><td>2</td>
	<td><a href="dictView.jsp?ID=40837&amp;q=1&amp;word=%E9%8A%80%E8%A1%8C" >大通<cR>銀行</cR></a></td>
	<td class=ph> <code>ㄉㄚ<sup>ˋ</sup></code> <code>ㄊㄨㄥ</code></td></tr>
</table>`;

const concisedSearch = `<table>
<tr data-link='dictView.jsp?ID=28209&q=1' role='link'><td>1</td>
	<td><a href="dictView.jsp?ID=28209&amp;q=1" ><cR>行</cR></a></td>
	<td data-pre="(一)"><phon>ㄒㄧㄥ<sup>ˊ</sup></phon> </td></tr>
<tr data-link='dictView.jsp?ID=19765&q=1' role='link'><td>2</td>
	<td><a href="dictView.jsp?ID=19765&amp;q=1" ><cR>行</cR></a></td>
	<td data-pre="(三)"><phon>ㄏㄤ<sup>ˊ</sup></phon> </td></tr>
<tr data-link='dictView.jsp?ID=42074&q=1' role='link'><td>3</td>
	<td><a href="dictView.jsp?ID=42074&amp;q=1" >銀<cR>行</cR></a></td>
	<td><phon>ㄧㄣ<sup>ˊ</sup></phon></td></tr>
</table>`;

describe("MOE dictionary lookup", () => {
  it("keeps only entries whose headword equals the word, not fuzzy matches", () => {
    expect(parseSearchResults(revisedSearch, "銀行")).toEqual(["156656"]);
    expect(parseSearchResults(concisedSearch, "行")).toEqual(["28209", "19765"]);
    expect(parseSearchResults(revisedSearch, "大通")).toEqual([]);
    expect(parseSearchResults("<p>查無資料</p>", "銀行")).toEqual([]);
  });

  it("reads the headword from both dictionaries' entry page titles", () => {
    expect(parseViewHeadword("<title>&lt;部署&gt; 辭典檢視 - 教育部《國語辭典簡編本》2021</title>")).toBe("部署");
    expect(parseViewHeadword("<title>&lt; 部署 :  ㄅㄨˋ ㄕㄨˋ &gt;辭典檢視 - 教育部《重編國語辭典修訂本》2021</title>")).toBe("部署");
    expect(parseViewHeadword("<title>錯誤</title>")).toBeNull();
  });
});
