import unittest
from Modules import Variables

class TestVariables(unittest.TestCase):
    def setUp(self):
        # Clear variables before each test
        Variables._VARS.clear()

    def test_set_get_unset(self):
        Variables.set_var("foo", "bar")
        self.assertEqual(Variables.get_var("foo"), "bar")
        
        Variables.unset_var("foo")
        self.assertIsNone(Variables.get_var("foo"))

    def test_expansion_simple(self):
        Variables.set_var("user", "David")
        text = "Hello @user"
        self.assertEqual(Variables.expand_token(text), "Hello David")

    def test_expansion_braced(self):
        Variables.set_var("color", "red")
        text = "The @{color}bird"
        self.assertEqual(Variables.expand_token(text), "The redbird")

    def test_expansion_list(self):
        Variables.set_var("x", "1")
        tokens = ["Val: @x", "NoVar"]
        self.assertEqual(Variables.expand_list(tokens), ["Val: 1", "NoVar"])

    def test_escaping(self):
        Variables.set_var("x", "1")
        text = "Email me at david@@example.com"
        # Should become david@example.com, not expanded
        self.assertEqual(Variables.expand_token(text), "Email me at david@example.com")
        
    def test_missing_var(self):
        # Should collapse to empty string if missing? Or keep token?
        # Current implementation: returns "" if val is None
        text = "Hello @missing"
        self.assertEqual(Variables.expand_token(text), "Hello ")

if __name__ == '__main__':
    unittest.main()
