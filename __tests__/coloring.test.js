const { scoreToColor, rankToColor } = require('../utils/coloring');

describe('Coloring Utils', () => {
  describe('scoreToColor', () => {
    test('should return red color for score 0', () => {
      expect(scoreToColor(0)).toBe('#bf4040');
    });

    test('should return green color for score 50', () => {
      expect(scoreToColor(50)).toBe('#40bf40');
    });

    test('should return blue color for score 100', () => {
      expect(scoreToColor(100)).toBe('#4040bf');
    });

    test('should handle scores outside 0-100 range', () => {
      expect(scoreToColor(-10)).toBe('#bf4040');
      expect(scoreToColor(110)).toBe('#4040bf');
    });
  });

  describe('rankToColor', () => {
    test('should return blue color for rank 1 (highest)', () => {
      expect(rankToColor(1, 10)).toBe('#4040bf');
    });

    test('should return red color for lowest rank', () => {
      expect(rankToColor(10, 10)).toBe('#bf4040');
    });
  });
});
