import unittest

from scripts.poe_script import delivery_problems, ensure_closing_cta


class ClosingCtaTests(unittest.TestCase):
    def test_normalizes_like_synonym_without_duplicating_complete_cta(self):
        source = (
            "你更看重估值，还是盈利兑现？"
            "认可今天这个拆解的朋友，请给这期内容点个赞。"
            "也欢迎关注金融巨子，我会持续拆解最新热点背后的资金逻辑。"
            "下期咱们继续聊最新的市场变化。"
        )
        result = ensure_closing_cta(source)
        self.assertIn("请给这期内容点赞", result)
        self.assertEqual(result.count("关注金融巨子"), 1)
        self.assertEqual(result.count("下期咱们继续聊"), 1)
        self.assertNotIn("如果这期分析对你有帮助", result)

    def test_removes_legacy_duplicate_fallback(self):
        first = (
            "你怎么看？认可内容请点赞。"
            "欢迎关注金融巨子，我会持续拆解市场变化。"
            "下期咱们继续聊最新的市场变化。"
        )
        duplicate = first + "\n\n如果这期分析对你有帮助，记得点赞、关注金融巨子，咱们下期继续聊最新的市场变化。"
        self.assertEqual(ensure_closing_cta(duplicate), first)

    def test_adds_only_missing_like_action(self):
        source = "你怎么看？欢迎关注金融巨子，我会持续拆解市场变化。下期咱们继续聊。"
        result = ensure_closing_cta(source)
        self.assertEqual(result.count("关注金融巨子"), 1)
        self.assertEqual(result.count("下期咱们继续聊"), 1)
        self.assertIn("点赞", result)

    def test_delivery_diagnoses_duplicate_actions(self):
        ending = "你怎么看？请点赞并关注金融巨子。再次点赞并关注金融巨子。下期继续聊。"
        problems = delivery_problems("正文" * 600 + ending)
        self.assertIn("结尾重复引导点赞", problems)
        self.assertIn("结尾重复引导关注", problems)


if __name__ == "__main__":
    unittest.main()
